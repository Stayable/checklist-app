-- Query A — the offline devices, and which have no open ticket
SELECT p.short_code, d.name, d.type, d.console_host_id, d.last_seen_at, d.updated_at,
       (SELECT count(*) FROM tickets t
         WHERE t.device_id = d.id AND t.status IN ('OPEN','IN_PROGRESS')) AS open_tickets,
       (SELECT max(t.resolved_at) FROM tickets t WHERE t.device_id = d.id) AS last_resolved,
       (SELECT count(*) FROM network_jobs j JOIN network_events e ON e.id = j.event_id
         WHERE e.device_id = d.id AND j.kind = 'STANDARD_TIMER' AND j.status = 'PENDING') AS pending_timers,
       (SELECT max(e.received_at) FROM network_events e
         WHERE e.device_id = d.id AND e.event_type = 'PROBLEM') AS last_problem
FROM devices d JOIN properties p ON p.id = d.property_id
WHERE d.current_status = 'OFFLINE'
ORDER BY open_tickets, p.short_code, d.name;

-- Query B — the open tickets, and how many have no device
SELECT t.ticket_number, t.ticket_type, t.status, t.opened_at, p.short_code,
       t.parent_ticket_id IS NOT NULL AS is_child,
       d.name AS device, d.current_status AS device_status,
       left(t.alert_message, 70) AS alert
FROM tickets t JOIN properties p ON p.id = t.property_id
LEFT JOIN devices d ON d.id = t.device_id
WHERE t.status IN ('OPEN','IN_PROGRESS')
ORDER BY t.ticket_type, t.opened_at;
