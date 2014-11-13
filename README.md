node-squarespace-server
=======================

> A local Squarespace development server in [node.js](http://nodejs.org/) for folks using the [developer platform](http://developers.squarespace.com).



## Usage
This is not published to [npm](http://npmjs.org) yet, there is a [milestone](https://github.com/kitajchuk/node-squarespace-server/milestones/NPM%20Published) for that. It works well in its current state as a beta program so I would still encourage its use. Log issues that you find or just hit me up about any notes or insights you have for it.


## Installation
For now, you will do this manually:

```shell
git clone git@github.com:kitajchuk/node-squarespace-server.git

cd node-squarespace-server

npm install -g .
```

#### Updating
For now you will do this manually:

```shell
# cd to node-squarespace-server directory, wherever you cloned it to...

git pull origin master

npm install . -g
```



## Usage
Navigate to your [Squarespace](http://squarespace.com) developer template and add to your `template.conf` file:

```json
"server": {
    "siteurl": "https://yoursite.squarespace.com"
}
```

If you are using a site-wide password, then you would have the following:

```json
"server": {
    "siteurl": "https://yoursite.squarespace.com",
    "password": "yoursitewidepassword"
}
```

And you will want to add this to your `.gitignore`:

```shell
# Ignore server cache
.sqs-cache
```

Once you have that, a simple:

```shell
# View api
sqs

# Print package version
sqs --version

# Run the server
sqs server

# Run the server with forever
sqs server --forever

# Run the server on a specific port
sqs server --port=8000

# Bust local cache
sqs buster
```

This runs the [express](http://expressjs.com) server on the relevant port. The default is `localhost:5050`.



## Workflow
You can use any front-end workflow you like when working with a custom Squarespace template. At the very least the separation of your source files and your actual template is recommended. I have developed a [grunt](http://gruntjs.com) workflow that bootstraps a [grunt-nautilus](https://github.com/kitajchuk/grunt-nautilus) based approach: [grunt-init-squarespace](https://github.com/kitajchuk/grunt-init-squarespace). At the very least, this is a good example of how to go about setting up your own workflow which keeps your source and template code separate.



## Login
You will first be prompted with a login page. Enter your email and password for YOUR Squarespace account ( used for logging into `/config` ) that is associated with THIS Squarespace site. This information is not stored anywhere, it is just used to make some initial requests to retrieve data for your site.



## Logout
Logging out is easy. Stopping the server will log you out if you are working locally. If you are running the instance on a deployed server, you can always hit `/logout` to logout. You will automatically be logged out after a period of 24 hours.



## Performance and Caching
When you make initial requests to the pages of your site, they will likely be slow. Imagine why. For every page the module needs to request both full `html` (for headers and footers parsing) and `json` (for rendering). That's 2 requests. For every `squarespace:query` and `squarespace:block-field` tag the module must make another request. Well, that's a lot of requests for sure. Luckily, the module caches everything via a `.sqs-cache` directory in your template root. This is good to speed things up. But, sometimes you want to pull down the latest and greatest content from your site. You can do this by hitting any page with a `?nocache` query string. To blow away your entire cache you can either delete it manually or use the `sqs buster` command.



## Deploy
All testing of this module has been done locally. Once testing is completed for running this on a deployed server expect the steps to be listed here.



## Notes
The primary purpose of this is to speed up aspects of development locally before you need to push to your Squarespace site. I think we can all agree that having to execute a `git push` to test your code is not practical. So, enjoy.

-BK
