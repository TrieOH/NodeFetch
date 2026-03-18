# NodeFetch

A collection of utilities for making robust and typed HTTP requests in Node.js. This project provides a flexible `FetchClient` with support for custom response envelopes, timeouts, and middleware adapters, as well as a lightweight `simpleFetch` for one-off requests.

## Installation

Use `bun install` to install the dependencies.

```bash
bun install
```

## Usage

### Simple Requests

You can use the `simpleFetch` for basic JSON requests:

```typescript
import { simpleFetch } from './src/utils/fetch';

interface User {
  id: number;
  name: string;
}

async function getUser() {
  try {
    const user = await simpleFetch<User>('https://api.example.com/users/1');
    console.log(user.name);
  } catch (error) {
    console.error(error);
  }
}
```

### Advanced Usage: The Fetch Client

For more advanced scenarios, you can create a client. The default client is great for standard APIs.

```typescript
import { createDefaultFetchClient } from './src/utils/fetch';

const client = createDefaultFetchClient({
  baseURL: 'https://api.example.com',
  timeout: 5000,
});

async function getUser() {
  const result = await client.get<User>('/users/1');
  if (result.success) {
    console.log(result.data.name);
  } else {
    console.error('Request failed:', result.message);
  }
}
```

### Custom Client Configuration

If you're working with an API that has a non-standard response format, you can configure the client to map responses to your desired shapes.

Imagine an API that returns this:
```json
{
  "status": "SUCCESS",
  "data": { "id": 1, "name": "Sora" }
}
```

You can create a client to handle it perfectly:

```typescript
import { createFetchClient } from './src/utils/fetch';

interface CustomSuccess {
  status: string;
}

interface CustomFailure {
  errorCode: number;
  reason: string;
}

const customClient = createFetchClient<CustomSuccess, CustomFailure>({
  baseURL: 'https://my-custom-api.com',
  isSuccess: (raw) => (raw as any)?.status === 'SUCCESS',
  toSuccess: <T>(raw: any) => ({ status: raw.status, data: raw.data as T }),
  toFailure: (raw: any, status: number) => ({
    errorCode: raw?.errorCode ?? status,
    reason: raw?.reason ?? 'Unknown API error',
  }),
  onNetworkError: (error) => ({
    errorCode: 503,
    reason: error instanceof Error ? error.message : 'Network error',
  }),
});

const result = await customClient.get<User>('/profile');
if (result.success) {
  console.log(result.status); // => "SUCCESS"
  console.log(result.data.name); // => "Sora"
}
```
