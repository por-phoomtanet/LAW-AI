export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "HttpError";
  }
}

export class NotFoundError extends HttpError {
  constructor(message = "ไม่พบข้อมูล") {
    super(404, message);
    this.name = "NotFoundError";
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = "กรุณาเข้าสู่ระบบ") {
    super(401, message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = "ไม่มีสิทธิ์เข้าถึง") {
    super(403, message);
    this.name = "ForbiddenError";
  }
}

export class ConflictError extends HttpError {
  constructor(message = "ข้อมูลซ้ำในระบบ") {
    super(409, message);
    this.name = "ConflictError";
  }
}
