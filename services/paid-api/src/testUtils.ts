// In-memory Express request/response helpers (no loopback networking), shared by the x402 route tests.
import { EventEmitter } from "node:events";

// Helper to invoke Express middleware in-memory without loopback network restrictions
export interface MockRes extends EventEmitter {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
  setHeader: (k: string, v: string) => void;
  getHeader: (k: string) => string | undefined;
  status: (code: number) => MockRes;
  json: (data: unknown) => MockRes;
  send: (data: unknown) => MockRes;
  end: (data?: unknown) => MockRes;
}

export function makeMockRes(): { res: MockRes; done: Promise<MockRes> } {
  let resolve: (res: MockRes) => void;
  const done = new Promise<MockRes>((r) => {
    resolve = r;
  });

  const res = new EventEmitter() as MockRes;
  res.statusCode = 200;
  res.headers = {};
  res.setHeader = (k, v) => {
    res.headers[k.toLowerCase()] = v;
  };
  res.getHeader = (k) => res.headers[k.toLowerCase()];
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  // Note: json/send resolve directly instead of going through res.end, so @x402/express's settlement step
  // (which waits on a real HTTP response) is not exercised here. Settlement is proven by the live testnet run.
  res.json = (data) => {
    res.body = data;
    resolve(res);
    return res;
  };
  res.send = (data) => {
    res.body = data;
    resolve(res);
    return res;
  };
  res.end = (data) => {
    if (data && !res.body) res.body = data;
    resolve(res);
    return res;
  };

  return { res, done };
}

export function makeMockReq(options: { url?: string; headers?: Record<string, string> }) {
  return {
    method: "GET",
    url: options.url || "/ping",
    headers: options.headers || { host: "localhost:4020" },
    connection: { encrypted: false },
    socket: { encrypted: false },
    get(name: string) {
      return (this.headers as Record<string, string>)[name.toLowerCase()];
    },
  };
}

export function dispatch(app: unknown, req: unknown, res: unknown): void {
  (app as { handle: (req: unknown, res: unknown) => void }).handle(req, res);
}
