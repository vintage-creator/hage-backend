import { Controller, Get, Query, Req, Res, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Response } from "express";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { GenerateReportQueryDto, OrderHistoryReportQueryDto, OverallReportQueryDto, PeriodQueryDto, ReportPeriod } from "./dto/reports-query.dto";
import { ReportsService } from "./reports.service";

@ApiTags("reports")
@Controller("reports")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth("access-token")
export class ReportsController {
	constructor(private readonly reports: ReportsService) {}

	private userId(req: any) {
		return req.user?.sub || req.user?.id;
	}

	@Get("order-history")
	@ApiOperation({ summary: "Get order history tracking metrics" })
	@ApiQuery({ name: "days", required: false, example: 7 })
	@ApiQuery({ name: "from", required: false })
	@ApiQuery({ name: "to", required: false })
	@ApiQuery({ name: "deliveryStatus", required: false, enum: ["delivered", "in-transit", "delayed"] })
	orderHistory(@Req() req: any, @Query() query: OrderHistoryReportQueryDto) {
		return this.reports.orderHistory(this.userId(req), query);
	}

	@Get("delivery")
	@ApiOperation({ summary: "Get delivery report metrics" })
	deliveryReport(@Req() req: any) {
		return this.reports.deliveryReport(this.userId(req));
	}

	@Get("delivery-by-countries")
	@ApiOperation({ summary: "Get delivery metrics by country" })
	@ApiQuery({ name: "period", required: false, enum: ReportPeriod })
	deliveryByCountries(@Req() req: any, @Query() query: PeriodQueryDto) {
		return this.reports.deliveryByCountries(this.userId(req), query);
	}

	@Get("financial-overview")
	@ApiOperation({ summary: "Get financial overview" })
	@ApiQuery({ name: "period", required: false, enum: ReportPeriod })
	financialOverview(@Req() req: any, @Query() query: PeriodQueryDto) {
		return this.reports.financialOverview(this.userId(req), query);
	}

	@Get("overall")
	@ApiOperation({ summary: "Get overall shipment report" })
	@ApiQuery({ name: "fromDate", required: false, example: "2026-01-01" })
	@ApiQuery({ name: "toDate", required: false, example: "2026-12-31" })
	overallReport(@Req() req: any, @Query() query: OverallReportQueryDto) {
		return this.reports.overallReport(this.userId(req), query);
	}

	@Get("overall/generate")
	@ApiOperation({ summary: "Generate overall report in Excel-compatible format" })
	@ApiResponse({ status: 200, description: "Returns an Excel-compatible .xls file" })
	@ApiQuery({ name: "customerName", required: false })
	@ApiQuery({ name: "transporterType", required: false })
	@ApiQuery({ name: "shipmentType", required: false })
	@ApiQuery({ name: "fromDate", required: false, example: "2026-01-01" })
	@ApiQuery({ name: "toDate", required: false, example: "2026-12-31" })
	async generateOverallReport(@Req() req: any, @Query() query: GenerateReportQueryDto, @Res() res: Response) {
		const buffer = await this.reports.generateOverallReport(this.userId(req), query);
		res.setHeader("Content-Type", "application/vnd.ms-excel; charset=utf-8");
		res.setHeader("Content-Disposition", 'attachment; filename="hage-overall-report.xls"');
		res.send(buffer);
	}
}
