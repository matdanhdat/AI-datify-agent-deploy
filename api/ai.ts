import { handleAi } from './_lib/handler';

export const config = {
  maxDuration: 60,
};

export default async function handler(request: Request): Promise<Response> {
  return handleAi(request);
}

export async function POST(request: Request): Promise<Response> {
  return handleAi(request);
}

