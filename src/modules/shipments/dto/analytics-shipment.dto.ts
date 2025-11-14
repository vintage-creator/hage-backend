export class AnalyticsResponseDto {
	activeShipment!: number;
	shipmentsInTransit!: number;
	completedDeliveries!: number;
	delayedShipments!: number;
	averageDeliveryTime!: {
		hours: number;
		minutes: number;
		totalMinutes: number;
	};
	totalShipments!: number;
	byStatus!: {
		pending: number;
		accepted: number;
		inTransit: number;
		completed: number;
		cancelled: number;
		delayed: number;
	};
	recentActivity!: Array<{
		shipmentId: string;
		orderId: string;
		status: string;
		updatedAt: Date;
	}>;
}
