export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = "error",
  ) {
    super(message);
  }
}

export const notFound = (msg = "Registro não encontrado") => new AppError(404, msg, "not_found");
export const unauthorized = (msg = "Não autenticado") => new AppError(401, msg, "unauthorized");
export const forbidden = (msg = "Acesso negado") => new AppError(403, msg, "forbidden");
