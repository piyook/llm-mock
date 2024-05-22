FROM node:lts-alpine
ENV NODE_ENV=development
WORKDIR /usr/src/app
COPY ["package.json", "package-lock.json*", "npm-shrinkwrap.json*", "./"]

# note this can be started in production mode with --production flag, so any dev dependencies will not be installed
RUN npm install --silent && mv node_modules ../
COPY . .
EXPOSE 9090
RUN chown -R node /usr/src/app
USER node
CMD ["npm", "run","dev"]
