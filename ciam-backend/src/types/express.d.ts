import { JWTPayload } from './index';

declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
      session?: any;
      ip: string;
      url: string;
      method: string;
      params: any;
      query: any;
      cookies: any;
      get(header: string): string | undefined;
    }
  }
}

export interface AuthenticatedRequest extends Express.Request {
  user: JWTPayload;
}