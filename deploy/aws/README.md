# Backend on AWS (EC2 + Docker)

Sidd's backend (`services/backend`) runs as one Docker container on a small EC2 server in Mumbai (`ap-south-1`), behind Caddy for HTTPS. The SQLite database (invoices, approvals, seller names) lives on the server's disk at `/opt/invoice-agent/data`, so it survives restarts and redeploys.

| Piece | What it is |
|---|---|
| ECR `invoice-agent-api` | Private image registry. The server pulls with its IAM role; no tokens. |
| EC2 `invoice-agent-api` | Amazon Linux 2023, `t3.micro`, 20 GB encrypted gp3, Elastic IP. No SSH; managed through SSM. |
| Security group | Ports 80 and 443 only. |
| Parameter Store `/invoice-agent/api/*` | The backend's settings, encrypted (SecureString). Fetched onto the server at each deploy into a root-only file. |
| Caddy | Automatic HTTPS for `https://<ip-with-dashes>.sslip.io`. |

Rough cost: about $13/month (instance about $8, public IPv4 about $3.6, disk about $1.8); a `t3.micro` is free-tier eligible on new accounts.

## First time

1. Install and log in to the AWS CLI (`winget install -e --id Amazon.AWSCLI`, then `aws configure sso` or `aws configure`).
2. `bash deploy/aws/provision.sh` creates everything above and prints the backend URL.
3. `bash deploy/aws/put-secrets.sh path/to/backend.env` uploads the settings (run it yourself; it never prints values).
4. Start Docker Desktop, then `bash deploy/aws/deploy.sh`.
5. Set Vercel's `NEXT_PUBLIC_BACKEND_URL` to the printed URL and redeploy the web app.

## Every update

`bash deploy/aws/deploy.sh` builds the image locally, pushes it to ECR and restarts the container through SSM. Logs: `aws ssm start-session --target <instance-id>` then `docker logs -f api`.

## Changing a setting

Re-run `put-secrets.sh` (or edit the parameter in the console), then `deploy.sh` to restart with it.
