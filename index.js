const express = require('express');
const cors = require('cors');
require('dotenv').config({ path: '.env.local' });
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
        const usersCollection = db.collection('users');

        console.log('✅ Connected to MongoDB');

        // Routes
        app.get('/', (req, res) => {
            res.send({ message: 'Social Events Server is running' });
        });

        //Event Routes

        // Get all upcoming events
        app.get('/events', async (req, res) => {
            try {
                const { type, search, location, dateRange, sortBy, page = 1, limit = 9 } = req.query;
                const today = new Date();
                const query = { eventDate: { $gte: today } };

                if (type) query.eventType = type;
                if (search) query.title = { $regex: search, $options: 'i' };
                if (location) query.location = { $regex: location, $options: 'i' };

                // Date range filter
                if (dateRange) {
                    const now = new Date();
                    let endDate;
                    switch (dateRange) {
                        case 'thisWeek':
                            endDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
                            break;
                        case 'thisMonth':
                            endDate = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
                            break;
                        case 'nextMonth':
                            endDate = new Date(now.getFullYear(), now.getMonth() + 2, now.getDate());
                            break;
                        default:
                            endDate = null;
                    }
                    if (endDate) {
                        query.eventDate.$lte = endDate;
                    }
                }

                let sortOption = { eventDate: 1 }; // Default: earliest first
                if (sortBy) {
                    switch (sortBy) {
                        case 'newest':
                            sortOption = { createdAt: -1 };
                            break;
                        case 'title':
                            sortOption = { title: 1 };
                            break;
                        case 'date':
                        default:
                            sortOption = { eventDate: 1 };
                            break;
                    }
                }

                const skip = (parseInt(page) - 1) * parseInt(limit);
                const totalEvents = await eventsCollection.countDocuments(query);
                const totalPages = Math.ceil(totalEvents / parseInt(limit));

                const results = await eventsCollection
                    .find(query)
                    .sort(sortOption)
                    .skip(skip)
                    .limit(parseInt(limit))
                    .toArray();

                res.send({
                    events: results,
                    totalPages,
                    currentPage: parseInt(page),
                    totalEvents
                });
            } catch (err) {
                console.error(err);
                res.status(500).send({ message: 'Server error' });
            }
        });

        // Get total events count
        app.get('/events/count', async (req, res) => {
            try {
                const total = await eventsCollection.countDocuments({});
                res.send({ total });
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
                const { title, description, eventType, thumbnail, images, location, eventDate } = req.body;
                if (!title || !eventType || !location || !eventDate) {
                    return res.status(400).send({ message: 'Missing required fields' });
                }

                const dateObj = new Date(eventDate);
                if (isNaN(dateObj) || dateObj < new Date()) {
                    return res.status(400).send({ message: 'Invalid or past date' });
                }

                // Validate images field if present
                let eventImages = [];
                if (images && Array.isArray(images)) {
                    eventImages = images.filter(img => img && img.trim() !== '');
                    if (eventImages.length === 0 && !thumbnail) {
                        return res.status(400).send({ message: 'At least one image is required' });
                    }
                } else if (!thumbnail) {
                    return res.status(400).send({ message: 'At least one image is required' });
                }

                const newEvent = {
                    title,
                    description: description || '',
                    eventType,
                    thumbnail: thumbnail || '',
                    images: eventImages.length > 0 ? eventImages : undefined,
                    location,
                    eventDate: dateObj,
                    creatorEmail: req.user.email,
                    createdAt: new Date()
                };

                // Remove undefined fields
                Object.keys(newEvent).forEach(key => newEvent[key] === undefined && delete newEvent[key]);

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

                // Validate images field if present
                if (updates.images !== undefined) {
                    if (!Array.isArray(updates.images) || updates.images.length === 0) {
                        return res.status(400).send({ message: 'Images must be a non-empty array' });
                    }
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
        // Get joined events for user
        app.get('/users/me/joined', verifyToken, async (req, res) => {
            try {
                const email = req.user.email;
                console.log('Joined events request for email:', email);
                const pipeline = [
                    { $match: { userEmail: email } },
                    {
                        $lookup: {
                            from: 'events',
                            localField: 'eventId',
                            foreignField: '_id',
                            as: 'event'
                        }
                    },
                    { $unwind: '$event' },
                    { $replaceRoot: { newRoot: { $mergeObjects: ['$event', { joinedAt: '$joinedAt' }] } } },
                    { $sort: { eventDate: 1 } }
                ];

                const result = await joinsCollection.aggregate(pipeline).toArray();
                console.log('Joined events found:', result.length);
                res.send(result);
            } catch (err) {
                console.error(err);
                res.status(500).send({ message: 'Server error' });
            }
        });

        // Register or update user
        app.post('/users', verifyToken, async (req, res) => {
            try {
                const { email, name, picture, uid } = req.user;
                const userDoc = {
                    displayName: name || '',
                    photoURL: picture || '',
                    firebaseUID: uid,
                    lastLogin: new Date()
                };

                const result = await usersCollection.updateOne(
                    { email },
                    {
                        $set: userDoc,
                        $setOnInsert: {
                            email,
                            role: 'user',
                            isBlocked: false,
                            createdAt: new Date()
                        }
                    },
                    { upsert: true }
                );

                res.send({ message: 'User registered/updated', result });
            } catch (err) {
                console.error(err);
                res.status(500).send({ message: 'Server error' });
            }
        });

        // Get current user profile
        app.get('/users/me', verifyToken, async (req, res) => {
            try {
                const email = req.user.email;
                const user = await usersCollection.findOne({ email });
                if (!user) {
                    return res.status(404).send({ message: 'User not found' });
                }
                res.send(user);
            } catch (err) {
                console.error(err);
                res.status(500).send({ message: 'Server error' });
            }
        });

        // Update current user profile
        app.put('/users/me', verifyToken, async (req, res) => {
            try {
                const email = req.user.email;
                const updates = req.body;

                // Prevent updating sensitive fields
                delete updates.email;
                delete updates.createdAt;
                delete updates.role; // Only admin can change role
                delete updates.isBlocked; // Only admin can block

                const result = await usersCollection.updateOne(
                    { email },
                    { $set: { ...updates, lastLogin: new Date() } }
                );

                if (result.matchedCount === 0) {
                    return res.status(404).send({ message: 'User not found' });
                }

                res.send({ message: 'Profile updated successfully' });
            } catch (err) {
                console.error(err);
                res.status(500).send({ message: 'Server error' });
            }
        });

        // Get user by email (public info)
        app.get('/users/email/:email', async (req, res) => {
            try {
                const email = req.params.email;
                const user = await usersCollection.findOne({ email }, { projection: { displayName: 1, photoURL: 1, email: 1 } });
                if (!user) {
                    return res.status(404).send({ message: 'User not found' });
                }
                res.send(user);
            } catch (err) {
                console.error(err);
                res.status(500).send({ message: 'Server error' });
            }
        });

        // Update user role (admin only)
        app.put('/users/:email/role', verifyToken, async (req, res) => {
            try {
                const email = req.params.email;
                const { role } = req.body;
                const adminEmail = req.user.email;
                const admin = await usersCollection.findOne({ email: adminEmail });
                if (!admin || admin.role !== 'admin') {
                    return res.status(403).send({ message: 'Admin access required' });
                }
                const result = await usersCollection.updateOne({ email }, { $set: { role } });
                if (result.matchedCount === 0) {
                    return res.status(404).send({ message: 'User not found' });
                }
                res.send({ message: 'User role updated' });
            } catch (err) {
                console.error(err);
                res.status(500).send({ message: 'Server error' });
            }
        });

        // Toggle user blocked status (admin only)
        app.patch('/users/:email/block', verifyToken, async (req, res) => {
            try {
                const email = req.params.email;
                const { isBlocked } = req.body; // Expect boolean
                const adminEmail = req.user.email;
                const adminUser = await usersCollection.findOne({ email: adminEmail });
                
                if (!adminUser || adminUser.role !== 'admin') {
                    return res.status(403).send({ message: 'Admin access required' });
                }

                const result = await usersCollection.updateOne(
                    { email },
                    { $set: { isBlocked: isBlocked } }
                );

                if (result.matchedCount === 0) {
                    return res.status(404).send({ message: 'User not found' });
                }
                res.send({ message: `User ${isBlocked ? 'blocked' : 'unblocked'} successfully` });
            } catch (err) {
                console.error(err);
                res.status(500).send({ message: 'Server error' });
            }
        });

        // Delete user (admin only)
        app.delete('/users/:email', verifyToken, async (req, res) => {
            try {
                const email = req.params.email;
                const adminEmail = req.user.email;
                const admin = await usersCollection.findOne({ email: adminEmail });
                if (!admin || admin.role !== 'admin') {
                    return res.status(403).send({ message: 'Admin access required' });
                }
                const result = await usersCollection.deleteOne({ email });
                if (result.deletedCount === 0) {
                    return res.status(404).send({ message: 'User not found' });
                }
                res.send({ message: 'User deleted' });
            } catch (err) {
                console.error(err);
                res.status(500).send({ message: 'Server error' });
            }
        });
        app.get('/users', verifyToken, async (req, res) => {
            try {
                const email = req.user.email;
                const user = await usersCollection.findOne({ email });
                if (!user || user.role !== 'admin') {
                    return res.status(403).send({ message: 'Admin access required' });
                }

                const users = await usersCollection.find({}).toArray();
                res.send(users);
            } catch (err) {
                console.error(err);
                res.status(500).send({ message: 'Server error' });
            }
        });
    } catch (err) {
        console.error('DB connection error:', err);
    }
}

run().catch(console.dir);

app.listen(port, '0.0.0.0', () => {
    console.log(`Social Events Server running on port ${port}`);
});

