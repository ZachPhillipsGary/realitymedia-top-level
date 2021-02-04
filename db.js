const sqlite3 = require('sqlite3').verbose();
const AWS = require('aws-sdk');
const fs = require("fs");

class SimpleDB {
    // if a DB file isn't provided, use an in memory DB by default (DO NOT DO IN PRODUCTION)
    init(db_type = ":memory:") {
        // grab env params, we grab DB_FILE again so we don't have to worry about the in-memory edge case
        const {
            DB_FILE,
            AWS_REGION,
            AWS_BACKUP_BUCKET
        } = process.env;

        // setup AWS SDK for s3 sync of sqlite3 db
        AWS.config.update({
            region: AWS_REGION || "us-east-1" //default to us-east-1
        });
        // Create S3 service object
        this.s3 = new AWS.S3({
            apiVersion: '2006-03-01'
        });
        // check for sqlite3 DB file, don't init if we need to go to s3 first
        if (DB_FILE && AWS_REGION && AWS_BACKUP_BUCKET && !is_dir(DB_FILE)) {
            console.log(`${DB_FILE} does not exist`);
            this.s3.getObject({
                bucket: AWS_BACKUP_BUCKET,
                key: DB_FILE
            }, (error, data) => {
                if (error) {
                    console.log(error);
                    process.exit(1)
                }
                fs.writeFileSync(DB_FILE, data.Body);
                console.log(`${DB_FILE} loaded from ${AWS_BACKUP_BUCKET}`)
                this.db = new sqlite3.Database(DB_FILE || db_type);
            })
        }
        // finally, init our sqllite db if the file already exists or we are using memory
        this.db = new sqlite3.Database(DB_FILE || db_type);
    }
    // check if path exists
    is_dir(path) {
        try {
            const stat = fs.lstatSync(path);
            return stat.isDirectory();
        } catch (e) {
            // lstatSync throws an error if path doesn't exist
            return false;
        }
    }
    async backup() {

    }
    // Given an array of pre-prepared SQL Statements, run then in order :) 
    createTables(ddl_statements) {
        while (ddl_statements.length > 0) {
            const sqlStatement = ddl_statements.pop()
            console.log(`Running "${sqlStatement}"`);
            try {
                db.run(sqlStatement);
            } catch (e) {
                console.error(`Unable to run ${sqlStatement}:`, e.message)
                break;
            }
        }
        console.log("Completed operations:", ddl_statements)
    }
    // Not for unsanitized SQL inputs https://xkcd.com/327/
    async query_unsafe(statement) {
        try {
            await this.db.run(statement);
        } catch (e) {
            console.error(`Unable to run ${statement}:`, e.message)
        }
        return null;
    }
}

module.exports = new SimpleDB(process.env.DB_FILE)