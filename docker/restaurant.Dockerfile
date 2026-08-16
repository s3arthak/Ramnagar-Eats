FROM node:24-alpine AS build
WORKDIR /app
ARG VITE_API_URL=http://localhost:5000/api/v1
ARG VITE_SOCKET_URL=http://localhost:5000
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SOCKET_URL=$VITE_SOCKET_URL
COPY package.json package-lock.json ./
COPY apps/restaurant-web/package.json apps/restaurant-web/package.json
RUN npm ci --workspace=restaurant-web
# The restaurant app re-exports Button/Input from the customer app and its
# ui.css imports the customer ui.css — the customer source must be present.
COPY apps/customer-web apps/customer-web
COPY apps/restaurant-web apps/restaurant-web
RUN npm run build --workspace=restaurant-web

FROM nginx:1.29-alpine
COPY docker/nginx-restaurant.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/restaurant-web/dist /usr/share/nginx/html
EXPOSE 80
