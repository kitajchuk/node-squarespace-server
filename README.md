node-squarespace-server
=======================

> A local Squarespace development server in [node.js](http://nodejs.org/).


### About
This tool lets [Squarespace Developers](http://developers.squarespace.com) build their templates locally by running a node.js proxy server to interface with a Squarespace site. It watches your template and recompiles when changes are made. It's ever a WIP, but a step in the right direction for open-source Squarespace development.


### Release
***Using the latest package versions is always recommended.***
- [node-squarespace-server@0.4.1](https://www.npmjs.com/package/node-squarespace-server)
 - [node-squarespace-jsont@0.1.16](https://www.npmjs.com/package/node-squarespace-jsont)
 - [node-squarespace-logger@0.1.1](https://www.npmjs.com/package/node-squarespace-logger)
 - [node-squarespace-middleware@0.2.1](https://www.npmjs.com/package/node-squarespace-middleware)
 

#### Recent Updates
- Support more formatters:
 - `smartypants`
 - `pluralize` 
 - `comment-count`
 - `comment-link`
 - `like-button`
 - `social-button`
 - `social-button-inline`
 - `product-status`
 - `product-price`
 - `product-checkout`
- Implement livereload with [browser-sync](https://github.com/BrowserSync/browser-sync)
- Provide a sandbox dev hook in JSONT, `nodeServer`
- Better naming convention for local .sqs-cache
- Catch and handle redirect for clickthroughUrl's
- [Support recursive section/repeated section context in JSONT](https://github.com/kitajchuk/node-squarespace-jsont/commit/1e1dc86d56e3e713e4d4c3c4af3fc59d6ba3cd55)
- Support parsing block partials inside of other block partials
- Support template lookup when regionKey seems invalid
- Integrate better logging using [node-squarespace-logger](https://github.com/kitajchuk/node-squarespace-logger)
- Support folder-navigation tag
- Support static pages
- Support system search page


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

#### API

```shell
# View api
sqs

# Print package version
sqs --version

# Run the server
sqs server

# Run the server with livereload
sqs server --reload

# Run the server with forever
sqs server --forever

# Stop server started with forever
sqs server --fornever

# Run the server on a specific port
sqs server --port=8000

# Silence the server logging
sqs server --quiet

# Bust local cache
sqs buster
```

This runs the [express](http://expressjs.com) server on the relevant port. The default is `localhost:5050`.


### Troubleshooting
These are the most common causes for issues running the server and how to resolve them.

- Make sure you use the `https` protocol for your siteurl.
- Make sure you use the `"sandbox": true` setting in your template.conf if using an account in trial mode.
- When in doubt, bust your local cache with `sqs buster` and try again.
- If all else fails, [open an issue](https://github.com/kitajchuk/node-squarespace-server/issues/new) and lets get to the bottom of it.



### Workflow
You can use any front-end workflow you like when working with a custom Squarespace template. At the very least the separation of your source files and your actual template is recommended. I have developed a [grunt](http://gruntjs.com) workflow that bootstraps a [grunt-nautilus](https://github.com/kitajchuk/grunt-nautilus) based approach: [grunt-init-squarespace](https://github.com/kitajchuk/grunt-init-squarespace). This boilerplate, [grunt-nautilus-squarespace-boilerplate](https://github.com/kitajchuk/grunt-nautilus-squarespace-boilerplate), is a better starting place if this fits your style. And if you're not a fan of [Grunt](http://gruntjs.com/), the [templar](https://github.com/kitajchuk/templar) boilerplate project is one that aims to reduce the dependency footprint as well as provide a better suite of tools including [Webpack](https://webpack.github.io/), [ESLint](http://eslint.org/) and [Babel](http://babeljs.io/).



### Login
You will first be prompted with a login page. Enter your email and password for __YOUR__ Squarespace account ( used for logging into `/config` ) that is associated with __THIS__ Squarespace site. This information is not stored anywhere, it is just used to make some initial requests to retrieve data for your site.



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
