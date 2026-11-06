import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  stages: [
    { duration: "30s", target: 10 },
    { duration: "1m", target: 25 },
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500"],
  },
};

const baseUrl = __ENV.BASE_URL || "http://127.0.0.1:3001/api/v1";

export default function () {
  const health = http.get(`${baseUrl}/health`);
  check(health, { "health is ready": (response) => response.status === 200 });

  if (__ENV.ACCESS_TOKEN) {
    const orders = http.get(`${baseUrl}/orders?page=1&pageSize=50`, {
      headers: { Authorization: `Bearer ${__ENV.ACCESS_TOKEN}` },
    });
    check(orders, { "orders query succeeds": (response) => response.status === 200 });
  }
  sleep(1);
}
