node-squarespace-server
=======================

> A local Squarespace development server in [node.js](http://nodejs.org/) for folks using the [developer platform](http://developers.squarespace.com).



## Installation
This is NOT finished. I recommend watching this repo if you would like to use it when it is ready. But, if you're interested, carry on. This is not yet published to [npm](http://npmjs.org), so your setup is as follows:

```shell
git clone git@github.com:kitajchuk/node-squarespace-server.git

cd node-squarespace-server

npm install -g .
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
    "password: "yoursitewidepassword"
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

# Run the server
sqs --server

# Print package version
sqs --version

# Bust local cache
sqs --buster
```

This runs the [express](http://expressjs.com) server on port `5050` for `localhost`. You will first be prompted with a login page. Enter your email and password for YOUR Squarespace account ( used for logging into /config ) that is associated with THIS Squarespace site. This information is not stored anywhere, it is just used to make some initial requests to retrieve data for your site.



## Notes
The primary purpose of this is to speed up aspects of development locally before you need to push to your Squarespace site. I think we can all agree that having to execute a `git push` to test your code is not practical. So, enjoy.

-BK