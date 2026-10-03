export {};

declare global {
  namespace Express {
    interface Request {
      id: string;
      auth?: import('../types/auth-context.js').AuthContext;
    }
  }
}
