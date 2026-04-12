import { useQuery } from "@tanstack/react-query";
import { getHealth } from "@/api/health";
import { ApiError } from "@/api/client";

export function HomePage() {
  const q = useQuery({
    queryKey: ["health"],
    queryFn: ({ signal }) => getHealth(signal),
  });

  return (
    <section className="page">
      <h2>API status</h2>
      <p className="muted">
        Calls <code>GET /api/v1/health</code> on your Logos base URL (
        <code className="wrap">Configured via VITE_LOGOS_API_BASE_URL or dev default localhost:8000</code>
        ). Enable CORS on Logos for this app&apos;s origin.
      </p>
      {q.isPending && <p>Checking…</p>}
      {q.isError && (
        <p className="error" role="alert">
          {q.error instanceof ApiError
            ? `${q.error.message} (HTTP ${q.error.status})`
            : q.error instanceof Error
              ? q.error.message
              : "Request failed"}
        </p>
      )}
      {q.isSuccess && (
        <p className="ok">
          Logos reports <strong>{q.data.status}</strong>
        </p>
      )}
    </section>
  );
}
