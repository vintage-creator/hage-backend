SELECT status, COUNT(*)
FROM "Shipment"
GROUP BY status;

SELECT status, COUNT(*)
FROM "ShipmentStatusHistory"
GROUP BY status;
