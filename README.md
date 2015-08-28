node-squarespace-server
=======================

> A local Squarespace development server in [node.js](http://nodejs.org/) for folks using the [developer platform](http://developers.squarespace.com).


### Release
***Using the latest is always recommended.***
- [0.2.11 - Stable](https://www.npmjs.com/package/node-squarespace-server).


### Installation
```shell
npm install -g node-squarespace-server
```

#### Updating
```shell
npm update -g node-squarespace-server
```



### Usage
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

If you are running a site in sandbox trial mode, then you would have the following:

```json
"server": {
    "siteurl": "https://yoursite.squarespace.com",
    "sandbox": true
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

# Stop server started with forever
sqs --fornever

# Run the server on a specific port
sqs server --port=8000

# Bust local cache
sqs buster
```

This runs the [express](http://expressjs.com) server on the relevant port. The default is `localhost:5050`.


### Troubleshooting
These are the most common causes for issues running the server and how to resolve them.

- Make sure you use the `https` protocol for your siteurl.
- Make sure you use the `"sandbox": true` setting in your template.conf if using an account in trial mode.
- Bust your local cache and rerun the server if getting the error `TypeError: Cannot read property 'typeName' of undefined`. This is usually a result of running the server on a trial mode account without the `"sandbox": true` setting. The app caches "undefined" locally as it cannot access your site. Adding the setting to template.conf fixes the issue, but you still need to clear your local cache to get going again. Use `sqs buster` to achieve this.



### Middleware
This uses the [node-squarespace-middleware](https://github.com/kitajchuk/node-squarespace-middleware) to interface with your Squarespace site.



### Workflow
You can use any front-end workflow you like when working with a custom Squarespace template. At the very least the separation of your source files and your actual template is recommended. I have developed a [grunt](http://gruntjs.com) workflow that bootstraps a [grunt-nautilus](https://github.com/kitajchuk/grunt-nautilus) based approach: [grunt-init-squarespace](https://github.com/kitajchuk/grunt-init-squarespace). At the very least, this is a good example of how to go about setting up your own workflow which keeps your source and template code separate. I have been working on [grunt-nautilus-squarespace-boilerplate](https://github.com/kitajchuk/grunt-nautilus-squarespace-boilerplate) as a better starting place, try it out if it fits your style.



### Login
You will first be prompted with a login page. Enter your email and password for YOUR Squarespace account ( used for logging into `/config` ) that is associated with THIS Squarespace site. This information is not stored anywhere, it is just used to make some initial requests to retrieve data for your site.



### Logout
Logging out is easy. Stopping the server will log you out if you are working locally. If you are running the instance on a deployed server, you can always hit `/logout` to logout. You will automatically be logged out after a period of 24 hours.



### Performance and Caching
When you make initial requests to the pages of your site, they will likely be slow. Imagine why. For every page the module needs to request both full `html` (for headers and footers parsing) and `json` (for rendering). That's 2 requests. For every `squarespace:query` and `squarespace:block-field` tag the module must make another request. Well, that's a lot of requests for sure. Luckily, the module caches everything via a `.sqs-cache` directory in your template root. This is good to speed things up. But, sometimes you want to pull down the latest and greatest content from your site. You can do this by hitting any page with a `?nocache` query string. To blow away your entire cache you can either delete it manually or use the `sqs buster` command.



### Deploy
All testing of this module has primarily been done locally. Once further testing is completed for running this on a deployed server expect the steps to be listed here.



### Pull Requests
1. Fork it
2. Create your feature branch (`git checkout -b my-new-feature`)
3. Commit your changes (`git commit -am 'Add some feature'`)
4. Push to the branch (`git push origin my-new-feature`)
5. Create new Pull Request
