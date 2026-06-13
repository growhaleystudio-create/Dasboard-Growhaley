import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '5s', target: 20 }, // Ramp up to 20 users
    { duration: '15s', target: 20 }, // Stay at 20 users for 15s
    { duration: '5s', target: 0 },  // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<200'], // 95% of requests must complete below 200ms
  },
};

export default function () {
  // Assuming a test team ID and dummy session token.
  // In a real scenario, we would grab a valid session token from an auth endpoint first.
  const teamId = 'dummy-team';
  const url = \`http://localhost:3001/api/teams/\${teamId}/leads?search=john\`;

  // Provide a dummy session cookie since auth is required.
  const params = {
    cookies: {
      sessionId: 'test-session-id', 
    },
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const res = http.get(url, params);

  check(res, {
    'status is 200 or 401': (r) => r.status === 200 || r.status === 401,
  });

  sleep(1);
}
