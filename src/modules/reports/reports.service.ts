import { ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { GenerateReportQueryDto, OrderHistoryReportQueryDto, PeriodQueryDto, ReportPeriod, OverallReportQueryDto } from "./dto/reports-query.dto";

const DELIVERED_STATUSES = ["DELIVERED", "COMPLETED"];
const FAILED_STATUSES = ["CANCELLED"];
const IN_TRANSIT_STATUSES = ["ACCEPTED", "IN_WAREHOUSE", "IN_TRANSIT", "PICKED_UP", "PENDING"];

@Injectable()
export class ReportsService {
	constructor(private readonly prisma: PrismaService) {}

	private async userScope(userId: string) {
		const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, kind: true } });
		if (!user) throw new ForbiddenException("User not found");

		if (user.kind === "LOGISTIC_SERVICE_PROVIDER") return {};
		if (user.kind === "LAST_MILE_DELIVERY") return { assignedTransporterId: userId };
		return { OR: [{ createdBy: userId }, { customerId: userId }] };
	}

	private location(value: any) {
		if (!value) return {};
		if (typeof value === "object") return value;
		try {
			return JSON.parse(value);
		} catch {
			return {};
		}
	}

	private route(shipment: any) {
		const origin = this.location(shipment.origin);
		const destination = this.location(shipment.destination);
		return {
			from: [origin.address, origin.state || origin.region, origin.country].filter(Boolean).join(", ") || "N/A",
			to: [destination.address, destination.state || destination.region, destination.country].filter(Boolean).join(", ") || "N/A",
			fromCountry: origin.country ?? null,
			toCountry: destination.country ?? shipment.destinationCountry ?? null,
		};
	}

	private deliveryStatus(shipment: any) {
		if (DELIVERED_STATUSES.includes(shipment.status)) return "delivered";
		if (FAILED_STATUSES.includes(shipment.status)) return "canceled";
		if (shipment.deliveryDate && new Date(shipment.deliveryDate) < new Date() && !FAILED_STATUSES.includes(shipment.status)) return "delayed";
		return "in-transit";
	}

	private dateRange(fromDate?: string, toDate?: string) {
		const range: any = {};
		if (fromDate) range.gte = new Date(fromDate);
		if (toDate) range.lte = new Date(toDate);
		return Object.keys(range).length ? range : undefined;
	}

	private periodStart(period = ReportPeriod.MONTHLY) {
		const now = new Date();
		if (period === ReportPeriod.YEARLY) return new Date(now.getFullYear(), 0, 1);
		if (period === ReportPeriod.QUARTERLY) return new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
		return new Date(now.getFullYear(), now.getMonth(), 1);
	}

	private async scopedShipments(userId: string, extraWhere: any = {}) {
		const scope = await this.userScope(userId);
		return this.prisma.shipment.findMany({
			where: { AND: [scope, extraWhere] },
			include: {
				customer: { select: { id: true, email: true, company: { select: { fullName: true, businessName: true } } } },
				transporter: { select: { id: true, email: true, phone: true, kind: true, profilePicture: true, company: { select: { fullName: true, businessName: true, phoneNumber: true, emailAddress: true } } } },
				payment: true,
			},
			orderBy: { createdAt: "desc" },
		});
	}

	async orderHistory(userId: string, query: OrderHistoryReportQueryDto) {
		const days = Number(query.days ?? 7);
		const since = new Date();
		since.setDate(since.getDate() - days);

		const shipments = await this.scopedShipments(userId, { createdAt: { gte: since } });
		return shipments
			.map((shipment) => ({ shipment, route: this.route(shipment), deliveryStatus: this.deliveryStatus(shipment) }))
			.filter((row) => !query.deliveryStatus || row.deliveryStatus === query.deliveryStatus)
			.filter((row) => !query.from || row.route.from.toLowerCase().includes(query.from.toLowerCase()))
			.filter((row) => !query.to || row.route.to.toLowerCase().includes(query.to.toLowerCase()))
			.map(({ shipment, route, deliveryStatus }) => ({
				shipmentId: shipment.orderId,
				transportRoute: { from: route.from, to: route.to },
				deliveryStatus,
				deliveryDate: shipment.deliveryDate,
			}));
	}

	async deliveryReport(userId: string) {
		const shipments = await this.scopedShipments(userId);
		const delivered = shipments.filter((s) => DELIVERED_STATUSES.includes(s.status)).length;
		const failed = shipments.filter((s) => FAILED_STATUSES.includes(s.status)).length;
		const pending = shipments.length - delivered - failed;
		const counts = new Map<string, { count: number; transporter: any }>();

		for (const shipment of shipments) {
			if (!shipment.transporter) continue;
			const entry = counts.get(shipment.transporter.id) ?? { count: 0, transporter: shipment.transporter };
			entry.count += 1;
			counts.set(shipment.transporter.id, entry);
		}

		const topTransporter = [...counts.values()].sort((a, b) => b.count - a.count)[0] ?? null;
		return {
			delivered,
			pending,
			failed,
			topTransporter: topTransporter
				? {
						totalShipments: topTransporter.count,
						profile: topTransporter.transporter,
				  }
				: null,
		};
	}

	async deliveryByCountries(userId: string, query: PeriodQueryDto) {
		const shipments = await this.scopedShipments(userId, { createdAt: { gte: this.periodStart(query.period) } });
		const grouped = new Map<string, any>();

		for (const shipment of shipments) {
			const route = this.route(shipment);
			const country = route.toCountry ?? "Unknown";
			const transporter = shipment.transporter?.company?.businessName ?? shipment.transporter?.company?.fullName ?? shipment.transporter?.email ?? "Unassigned";
			const key = `${country}|${transporter}`;
			const row = grouped.get(key) ?? { country, transporter, delivered: 0, pending: 0, failed: 0 };
			if (DELIVERED_STATUSES.includes(shipment.status)) row.delivered += 1;
			else if (FAILED_STATUSES.includes(shipment.status)) row.failed += 1;
			else row.pending += 1;
			grouped.set(key, row);
		}

		return { period: query.period ?? ReportPeriod.MONTHLY, data: [...grouped.values()] };
	}

	async financialOverview(userId: string, query: PeriodQueryDto) {
		const shipments = await this.scopedShipments(userId, { createdAt: { gte: this.periodStart(query.period) } });
		const payments = shipments.map((s) => ({ shipment: s, payment: s.payment })).filter((row) => row.payment);
		const completed = payments.filter((row) => row.payment!.status === "SUCCESS");
		const pending = payments.filter((row) => row.payment!.status !== "SUCCESS");
		const transporterBreakdown = new Map<string, any>();

		for (const row of payments) {
			const name = row.shipment.transporter?.company?.businessName ?? row.shipment.transporter?.company?.fullName ?? row.shipment.transporter?.email ?? "Unassigned";
			const current = transporterBreakdown.get(name) ?? { transporter: name, totalTransactions: 0, completedTransactions: 0, pendingTransactions: 0, totalSpend: 0 };
			current.totalTransactions += 1;
			current.totalSpend += row.payment!.amount;
			if (row.payment!.status === "SUCCESS") current.completedTransactions += 1;
			else current.pendingTransactions += 1;
			transporterBreakdown.set(name, current);
		}

		return {
			period: query.period ?? ReportPeriod.MONTHLY,
			totalSpend: completed.reduce((sum, row) => sum + row.payment!.amount, 0),
			pendingTransactions: pending.length,
			completedTransactions: completed.length,
			transporterBreakdown: [...transporterBreakdown.values()],
		};
	}

	async overallReport(userId: string, query: OverallReportQueryDto) {
		const createdAt = this.dateRange(query.fromDate, query.toDate);
		const shipments = await this.scopedShipments(userId, createdAt ? { createdAt } : {});
		return shipments.map((shipment) => this.overallRow(shipment));
	}

	async generateOverallReport(userId: string, query: GenerateReportQueryDto) {
		const createdAt = this.dateRange(query.fromDate, query.toDate);
		const extraWhere: any = {};
		if (createdAt) extraWhere.createdAt = createdAt;
		if (query.shipmentType) extraWhere.shipmentType = query.shipmentType as any;

		const shipments = await this.scopedShipments(userId, extraWhere);
		const rows = shipments
			.filter((shipment) => !query.transporterType || shipment.transporter?.kind === query.transporterType)
			.map((shipment) => this.overallRow(shipment));
		const filtered = rows.filter((row) => {
			const customerMatch = !query.customerName || String(row.customer ?? "").toLowerCase().includes(query.customerName.toLowerCase());
			return customerMatch;
		});
		return this.toExcelBuffer(filtered);
	}

	private overallRow(shipment: any) {
		const route = this.route(shipment);
		return {
			shipmentId: shipment.orderId,
			route: {
				from: { location: route.from, date: shipment.pickupDate ?? shipment.createdAt },
				to: { location: route.to, date: shipment.deliveryDate },
			},
			price: shipment.totalCost,
			deliveryStatus: this.deliveryStatus(shipment),
			customer: shipment.customerName ?? shipment.customer?.company?.fullName ?? shipment.customer?.email ?? shipment.clientName,
			carrier: shipment.transporter?.company?.businessName ?? shipment.transporter?.company?.fullName ?? shipment.transporter?.email ?? null,
		};
	}

	private toExcelBuffer(rows: any[]) {
		const headers = ["Shipment ID", "Origin", "Origin Date", "Destination", "Destination Date", "Price", "Delivery Status", "Customer", "Carrier"];
		const escape = (value: any) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
		const htmlRows = rows
			.map(
				(row) =>
					`<tr><td>${escape(row.shipmentId)}</td><td>${escape(row.route.from.location)}</td><td>${escape(row.route.from.date)}</td><td>${escape(row.route.to.location)}</td><td>${escape(row.route.to.date)}</td><td>${escape(row.price)}</td><td>${escape(row.deliveryStatus)}</td><td>${escape(row.customer)}</td><td>${escape(row.carrier)}</td></tr>`,
			)
			.join("");
		const html = `<html><head><meta charset="utf-8"></head><body><table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${htmlRows}</tbody></table></body></html>`;
		return Buffer.from(html, "utf8");
	}
}
