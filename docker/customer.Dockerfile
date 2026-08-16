FROM node:24-alpine AS build
WORKDIR /app
ARG VITE_API_URL=http://localhost:5000/api/v1
ARG VITE_SOCKET_URL=http://localhost:5000
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SOCKET_URL=$VITE_SOCKET_URL
COPY package.json package-lock.json ./
COPY apps/customer-web/package.json apps/customer-web/package.json
RUN npm ci --workspace=customer-web
COPY apps/customer-web apps/customer-web
RUN npm run build --workspace=customer-web

FROM nginx:1.29-alpine
COPY docker/nginx-customer.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/customer-web/dist /usr/share/nginx/html
EXPOSE 80
