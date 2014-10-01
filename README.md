squarespace-server
==================

> A local Squarespace development server in [node.js](http://nodejs.org/) for folks using the [developer platform](http://developers.squarespace.com/get-started).


## Installation
Be wary, this is absolutely in development and is NOT finished. But, if you're interested, carry on with caution. This is not yet published to [npm](http://npmjs.org), so your setup is as follows:

```shell
git clone git@github.com:kitajchuk/squarespace-server.git

cd squarespace-server

npm install -g .
```



## Usage
Navigate to your [Squarespace](http://squarespace.com) developer template and create a `server.conf` file like this:

```json
{
    "siteurl": "https://yourite.squarespace.com",
    "password": "sitewide password here if applicable"
}
```

Once you have that, a simple:

```shell
sqs
```

This runs the [express](http://expressjs.com) server on port `5050` for `localhost`.



## Notes
Obviously this is still in development. There are a lot of things to consider with its usage. First and foremost, even if it is done someday, it runs as a logged out ALWAYS environment. You're seeing the site as a user or customer would see it AND you're missing certain content. Anyway, it is a pret project. But I am surprised at how far it has come along in a short amount of time.

Cheers,

-BK