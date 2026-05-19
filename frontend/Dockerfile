FROM node:25-alpine AS base

RUN apk add --no-cache openssl

# Set working directory
WORKDIR /usr/src/app

COPY ./vite/package*.json /usr/src/app/
RUN npm install

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000"]


FROM base AS production

# Copy app source
COPY ./vite /usr/src/app

# Install dependencies and build the app
RUN npm run build

# Set startup command for production
CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "3000"]
