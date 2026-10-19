// Fehler mit verständlicher Meldung für die Oberfläche.
export class UserError extends Error {
  constructor(public statusCode: number, message: string, public field?: string) {
    super(message);
  }
}

export const fail = (status: number, message: string, field?: string) => new UserError(status, message, field);
