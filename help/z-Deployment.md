**Please note that this page is for developers and system administrators, and likely does not contain any information relevant to users of MicrobeTrace.**

MicrobeTrace is designed to be an easy-to-deploy, client-side application. To set it up, simply clone the repository (or download the files) into a served directory, and you're done!

That said, MicrobeTrace also includes its own server. This server provides you with the added advantage of being able to serve MicrobeTrace's assets using gzip or brotli compression, substantially reducing the amount of bandwidth required to load MicrobeTrace. To set MicrobeTrace to leverage this, do the following:

```{bash}
# 1. Clone MicrobeTrace

git clone https://github.com/CDCgov/MicrobeTrace.git && cd MicrobeTrace

# 2. Download Dependencies

npm install

# 3. Create compressed versions of relevant files.

npm run compress

# 4. Start the server

npm start
```

You should now be able to access your MicrobeTrace instance by visiting http://localhost:5000/ You can subsequently configure a [reverse proxy](https://docs.nginx.com/nginx/admin-guide/web-server/reverse-proxy/) to integrate the MicrobeTrace server into your existing server stack.

## Deploying to Heroku

The [development instance of MicrobeTrace](https://devmicrobetrace.herokuapp.com/) is currently served from [Heroku](https://heroku.com/), following the `dev` branch of the repository. If you'd like to mirror this architecture for your own instance of MicrobeTrace, simply:

1. [Fork this Repository](https://github.com/CDCgov/MicrobeTrace).
2. [Create a new Heroku App](https://dashboard.heroku.com/new-app).
3. Point the Heroku app to your fork of the MicrobeTrace Repo.
4. Set Heroku to update automatically whenever `whateveryourbranchis` is updated.

And you're done. Good job!

## Deploying to S3

Deploying to S3 is a pain in the neck if you don't have the AWSCLI installed, so do us all a favor and [get that set up first](https://docs.aws.amazon.com/cli/latest/userguide/installing.html). Also, create a bucket from which to [serve the files](https://docs.aws.amazon.com/AmazonS3/latest/dev/WebsiteHosting.html). Then, from the MicrobeTrace directory,

```{bash}
aws s3 cp s3://<your-bucket>/ * -R
```

As soon as the upload is complete, your MicrobeTrace instance should be available at `http://<your-bucket>.s3-website-<AWS-region>.amazonaws.com`

Note that this won't update like a heroku deployment will ([there is not enough room on this wikipage](https://en.wikiquote.org/wiki/Pierre_de_Fermat) to explain how to set up that architecture).

## Deploying with Docker

MicrobeTrace includes a Dockerfile. To deploy into a docker environment, you should be able to simply clone the repo (see above) and run the following commands:

```sh
docker build -t microbetrace .
docker run -p 5000:5000 -d microbetrace
```
