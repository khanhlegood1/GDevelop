export interface ValidationIssue {
  field?: string;
  code: string;
  message: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly title: string;
  readonly retryable: boolean;
  readonly nextAction?: string;
  readonly issues: ValidationIssue[];

  constructor(init: {
    status: number;
    code: string;
    title: string;
    detail?: string;
    retryable?: boolean;
    nextAction?: string;
    issues?: ValidationIssue[];
  }) {
    super(init.detail ?? init.title);
    this.name = "ApiError";
    this.status = init.status;
    this.code = init.code;
    this.title = init.title;
    this.retryable = init.retryable ?? false;
    this.nextAction = init.nextAction;
    this.issues = init.issues ?? [];
  }
}

export function validationError(message: string, issues: ValidationIssue[] = []): ApiError {
  return new ApiError({
    status: 400,
    code: "VALIDATION_FAILED",
    title: "Dữ liệu chưa hợp lệ",
    detail: message,
    issues,
  });
}

export function unauthorized(message = "Bạn cần đăng nhập để tiếp tục."): ApiError {
  return new ApiError({
    status: 401,
    code: "AUTH_REQUIRED",
    title: "Chưa đăng nhập",
    detail: message,
    nextAction: "sign_in",
  });
}

export function forbidden(code: string, title: string, detail: string, nextAction?: string): ApiError {
  return new ApiError({ status: 403, code, title, detail, nextAction });
}

export function notFound(message = "Không tìm thấy tài nguyên hoặc bạn không có quyền truy cập."): ApiError {
  return new ApiError({
    status: 404,
    code: "RESOURCE_NOT_FOUND",
    title: "Không tìm thấy tài nguyên",
    detail: message,
  });
}

export function conflict(code: string, title: string, detail: string): ApiError {
  return new ApiError({ status: 409, code, title, detail });
}

export function unprocessable(code: string, title: string, detail: string): ApiError {
  return new ApiError({ status: 422, code, title, detail });
}

export function quotaExceeded(detail: string): ApiError {
  return new ApiError({
    status: 429,
    code: "QUOTA_EXCEEDED",
    title: "Đã đạt giới hạn Private Alpha",
    detail,
    retryable: true,
    nextAction: "try_later",
  });
}

export function serviceUnavailable(code: string, title: string, detail: string): ApiError {
  return new ApiError({ status: 503, code, title, detail, retryable: true });
}
