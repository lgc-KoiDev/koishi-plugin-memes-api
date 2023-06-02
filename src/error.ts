// TODO

export interface MemeError extends Error {
  errorCode: number;
  typeName: string;
  format: (...args: any[]) => string;
}
