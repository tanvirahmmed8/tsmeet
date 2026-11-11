import type { Request } from 'express';

// These routers use named single-segment parameters, never Express 5 wildcards.
export type NamedRouteRequest = Request<Record<string, string>>;
