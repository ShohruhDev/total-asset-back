FROM directus/directus:11

USER root

# Copy schema snapshot + start script
COPY --chown=node:node snapshots /directus/snapshots
COPY --chown=node:node start.sh /directus/start.sh
RUN chmod +x /directus/start.sh

# Extensions (kept empty by default — drop custom hooks/endpoints here)
COPY --chown=node:node extensions /directus/extensions

USER node

# Railway injects PORT — Directus reads it automatically via HOST/PORT envs.
# Do NOT hardcode EXPOSE 8055 if Railway expects a dynamic port.
EXPOSE 8055

CMD ["sh", "/directus/start.sh"]
