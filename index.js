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

// verify Firebase token
async function verifyToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).send({ message: 'Unauthorized' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = await admin.auth().verifyIdToken(token);
        req.user = decoded;
        next();
    } catch (err) {
        console.error('Token verification failed:', err);
        res.status(403).send({ message: 'Forbidden' });
    }
}

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

        // Get all upcoming events
        app.get('/events', async (req, res) => {
            try {
                const { type, search } = req.query;
                const today = new Date();
                const query = { eventDate: { $gte: today } };
                if (type) query.eventType = type;
                if (search) query.title = { $regex: search, $options: 'i' };

                const results = await eventsCollection.find(query).sort({ eventDate: 1 }).toArray();
                res.send(results);
            } catch (err) {
                console.error(err);
                res.status(500).send({ message: 'Server error' });
            }
        });

        // Get one event
        app.get('/events/:id', async (req, res) => {
            try {
                const id = req.params.id;
                const doc = await eventsCollection.findOne({ _id: new ObjectId(id) });
                if (!doc) return res.status(404).send({ message: 'Event not found' });
                res.send(doc);
            } catch (err) {
                console.error(err);
                res.status(400).send({ message: 'Invalid id' });
            }
        });


    } catch (err) {
        console.error('DB connection error:', err);
    }
}
