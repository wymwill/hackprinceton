/** An error with an HTTP status and a stable code the client and tests can check. */
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}
