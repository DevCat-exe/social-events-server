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

        //Event Routes

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

        // Create event (requires auth)
        app.post('/events', verifyToken, async (req, res) => {
            try {
                const { title, description, eventType, thumbnail, location, eventDate } = req.body;
                if (!title || !eventType || !location || !eventDate) {
                    return res.status(400).send({ message: 'Missing required fields' });
                }

                const dateObj = new Date(eventDate);
                if (isNaN(dateObj) || dateObj < new Date()) {
                    return res.status(400).send({ message: 'Invalid or past date' });
                }

                const newEvent = {
                    title,
                    description: description || '',
                    eventType,
                    thumbnail: thumbnail || '',
                    location,
                    eventDate: dateObj,
                    creatorEmail: req.user.email,
                    createdAt: new Date()
                };

                const result = await eventsCollection.insertOne(newEvent);
                res.send({ insertedId: result.insertedId });
            } catch (err) {
                console.error(err);
                res.status(500).send({ message: 'Server error' });
            }
        });

        // Update event
        app.put('/events/:id', verifyToken, async (req, res) => {
            try {
                const id = req.params.id;
                const updates = req.body;

                if (updates.eventDate) {
                    const dateObj = new Date(updates.eventDate);
                    if (isNaN(dateObj) || dateObj < new Date()) {
                        return res.status(400).send({ message: 'Invalid eventDate' });
                    }
                    updates.eventDate = dateObj;
                }

                const query = { _id: new ObjectId(id), creatorEmail: req.user.email };
                const result = await eventsCollection.updateOne(query, { $set: updates });

                if (result.matchedCount === 0)
                    return res.status(403).send({ message: 'Not authorized or event not found' });

                res.send({ modifiedCount: result.modifiedCount });
            } catch (err) {
                console.error(err);
                res.status(400).send({ message: 'Invalid id or payload' });
            }
        });

        // Delete event
        app.delete('/events/:id', verifyToken, async (req, res) => {
            try {
                const id = req.params.id;
                const userEmail = req.user.email;
                console.log('Delete request for event:', id, 'by user:', userEmail);
                const query = { _id: new ObjectId(id), creatorEmail: userEmail };
                const result = await eventsCollection.deleteOne(query);
                console.log('Delete result:', result);

                if (result.deletedCount === 0)
                    return res.status(403).send({ message: 'Not authorized or event not found' });

                // delete related joins
                await joinsCollection.deleteMany({ eventId: new ObjectId(id) });

                res.send({ deletedCount: result.deletedCount });
            } catch (err) {
                console.error(err);
                res.status(400).send({ message: 'Invalid id' });
            }
        });

        // Get events created by user
        app.get('/users/me/events', verifyToken, async (req, res) => {
            try {
                const email = req.user.email;
                console.log('Manage events request for email:', email);
                const result = await eventsCollection.find({ creatorEmail: email }).sort({ eventDate: 1 }).toArray();
                console.log('Manage events found:', result.length);
                res.send(result);
            } catch (err) {
                console.error(err);
                res.status(500).send({ message: 'Server error' });
            }
        });

        //Join Routes

        // Join event
        app.post('/events/:id/join', verifyToken, async (req, res) => {
            try {
                const id = req.params.id;
                const event = await eventsCollection.findOne({ _id: new ObjectId(id) });
                if (!event) return res.status(404).send({ message: 'Event not found' });

                const existing = await joinsCollection.findOne({
                    eventId: event._id,
                    userEmail: req.user.email
                });
                if (existing) return res.status(409).send({ message: 'Already joined' });

                const joinDoc = {
                    eventId: event._id,
                    userEmail: req.user.email,
                    joinedAt: new Date()
                };
                const result = await joinsCollection.insertOne(joinDoc);
                res.send({ insertedId: result.insertedId });
            } catch (err) {
                console.error(err);
                res.status(400).send({ message: 'Invalid id' });
            }
        });


    } catch (err) {
        console.error('DB connection error:', err);
    }
}
