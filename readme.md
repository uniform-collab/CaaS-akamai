# Context as a Service
## Requirements

- Node.js (v18+)
- Akamai CLI
- Uniform CLI

## Environment Setup

1. Copy `.env.example` to `.env`
2. Fill in your environment-specific values:
   - `EW_ID`: Your Akamai EdgeWorker ID
   - `NETWORK`: Target network for activation (production/staging)
   - `VERSION`: EdgeWorker version to activate
   - `SANDBOX_HOSTNAME`: Your sandbox hostname
   - `SANDBOX_NAME`: Name for your sandbox environment
3. Install dependencies

```bash
npm install
``` 

## Usage

The scripts will use default values if environment variables are not set:
- EW_ID defaults to 80886
- NETWORK defaults to "production"
- VERSION defaults to "3.1.3"
- SANDBOX_HOSTNAME defaults to "akamai-artemn.unfrm.uno"
- SANDBOX_NAME defaults to "artem-caas-demo-v1"

To use custom values, either:
1. Set them in your `.env` file, or
2. Pass them inline:
