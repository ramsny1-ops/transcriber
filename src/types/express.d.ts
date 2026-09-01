export {};

declare global {
  namespace Express {
    interface Request {
      auth?: {
        user: {
          id: string;
          email: string;
          displayName: string;
        };
        sessionId: string;
        csrfToken: string;
      };
    }
  }
}
