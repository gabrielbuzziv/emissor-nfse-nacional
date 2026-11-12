FROM node:24-alpine
RUN apk add --no-cache openssl
WORKDIR /app
COPY server.mjs sign.mjs ./
EXPOSE 8080
# The legacy provider lets the TLS client load older .pfx files (RC2/3DES), which many A1 certificates still are.
CMD ["node", "--openssl-legacy-provider", "server.mjs"]
