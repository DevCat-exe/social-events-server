const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const admin = require('firebase-admin');

const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

// Firebase Admin
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString("utf8");
const serviceAccount = JSON.parse(decoded);
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

// MongoDB setup
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.dnvpf65.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true
    }
});

async function run() {
    try {
        await client.connect();
        const db = client.db('social-events');
        const eventsCollection = db.collection('events');
        const joinsCollection = db.collection('joins');

        console.log('✅ Connected to MongoDB');

        // Routes
        app.get('/', (req, res) => {
            res.send({ message: 'Social Events Server is running' });
        });
    } catch (err) {
        console.error('DB connection error:', err);
    }
}
