FROM public.ecr.aws/aws-cli/aws-cli:2.36.44 AS awscli

FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY packages/anchoring/package.json packages/anchoring/package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    AWS_EC2_METADATA_DISABLED=true \
    AWS_PAGER="" \
    PYTHONDONTWRITEBYTECODE=1 \
    RDS_CA_PATH=/app/certs/rds-global-bundle.pem

RUN apt-get update \
    && apt-get install --no-install-recommends -y python3 ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app/certs \
    && python3 -c 'import urllib.request; urllib.request.urlretrieve("https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem", "/app/certs/rds-global-bundle.pem")'

# The reviewed resolver needs AWS CLI v2's container-role credential provider.
# Neither stage receives AWS credentials or a wallet at image-build time.
COPY --from=awscli /usr/local/aws-cli /usr/local/aws-cli
RUN ln -s /usr/local/aws-cli/v2/current/bin/aws /usr/local/bin/aws \
    && aws --version
COPY --from=dependencies /app/node_modules ./node_modules
COPY packages/anchoring/ ./
COPY infra/runtime/asm-exec /usr/local/bin/asm-exec
RUN chmod 0555 /usr/local/bin/asm-exec \
    && node --check worker.mjs

USER node
# Bound every invocation, including secret resolution and an unavailable RPC.
# ECS command overrides can append --dry-run without bypassing the resolver.
ENTRYPOINT ["/usr/bin/timeout", "--signal=TERM", "--kill-after=30s", "20m", "/usr/local/bin/asm-exec", "node"]
CMD ["worker.mjs"]
