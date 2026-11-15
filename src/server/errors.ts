/** An error with an HTTP status and a stable code the client and tests can check. */
export class AppError extends Error {
  public status: number;
  public code: string;
  constructor(
    status: number,
    code: string,
    message: string
  ) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
