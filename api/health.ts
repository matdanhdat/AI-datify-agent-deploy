import { handleHealth } from './_lib/handler';

export const config = {
  maxDuration: 60,
};

export default async function handler(request: Request): Promise<Response> {
  return handleHealth(request);
}

export async function GET(request: Request): Promise<Response> {
  return handleHealth(request);
}

