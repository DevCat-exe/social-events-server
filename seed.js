const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config({ path: '.env.local' });

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.dnvpf65.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true
    }
});

const sampleEvents = [
    {
        title: "Community Garden Workshop",
        description: "Learn sustainable gardening practices and community building. Join us for hands-on experience in urban farming.",
        eventType: "Community",
        thumbnail: "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=400",
        location: "Downtown Community Center, New York",
        eventDate: new Date("2026-02-15T10:00:00Z"),
        creatorEmail: "organizer@community.org",
        createdAt: new Date()
    },
    {
        title: "STEM Education Conference",
        description: "Annual conference featuring the latest in science, technology, engineering, and mathematics education.",
        eventType: "Education",
        thumbnail: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=400",
        location: "Tech University Campus, Boston",
        eventDate: new Date("2026-03-20T09:00:00Z"),
        creatorEmail: "edu@stemconf.com",
        createdAt: new Date()
    },
    {
        title: "Mental Health Awareness Seminar",
        description: "Expert-led discussion on mental wellness, stress management, and community support systems.",
        eventType: "Health",
        thumbnail: "https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=400",
        location: "Wellness Center, Los Angeles",
        eventDate: new Date("2026-04-10T14:00:00Z"),
        creatorEmail: "health@wellness.org",
        createdAt: new Date()
    },
    {
        title: "Environmental Conservation Summit",
        description: "Global leaders discuss climate action, sustainable development, and environmental protection strategies.",
        eventType: "Environment",
        thumbnail: "https://images.unsplash.com/photo-1569163139394-de4e4f43e4e3?w=400",
        location: "Green Conference Hall, Seattle",
        eventDate: new Date("2026-05-05T08:00:00Z"),
        creatorEmail: "environment@greenearth.com",
        createdAt: new Date()
    },
    {
        title: "Neighborhood Cleanup Drive",
        description: "Community volunteers unite to clean up local parks and promote environmental responsibility.",
        eventType: "Community",
        thumbnail: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400",
        location: "Riverside Park, Chicago",
        eventDate: new Date("2026-06-12T07:00:00Z"),
        creatorEmail: "cleanup@neighborhood.org",
        createdAt: new Date()
    },
    {
        title: "Digital Literacy Workshop",
        description: "Free workshop teaching essential computer skills, online safety, and digital communication.",
        eventType: "Education",
        thumbnail: "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=400",
        location: "Public Library, San Francisco",
        eventDate: new Date("2026-07-18T13:00:00Z"),
        creatorEmail: "digital@literacy.org",
        createdAt: new Date()
    },
    {
        title: "Yoga and Mindfulness Retreat",
        description: "Weekend retreat focusing on holistic health, meditation, and personal wellness practices.",
        eventType: "Health",
        thumbnail: "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=400",
        location: "Mountain Wellness Resort, Colorado",
        eventDate: new Date("2026-08-22T06:00:00Z"),
        creatorEmail: "yoga@mindfulretreat.com",
        createdAt: new Date()
    },
    {
        title: "Climate Change Awareness Campaign",
        description: "Interactive campaign raising awareness about climate change impacts and sustainable solutions.",
        eventType: "Environment",
        thumbnail: "https://images.unsplash.com/photo-1569163139394-de4e4f43e4e3?w=400",
        location: "Environmental Center, Portland",
        eventDate: new Date("2026-09-14T10:00:00Z"),
        creatorEmail: "climate@awareness.org",
        createdAt: new Date()
    },
    {
        title: "Community Art Exhibition",
        description: "Showcase of local artists' work celebrating cultural diversity and creative expression.",
        eventType: "Community",
        thumbnail: "https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400",
        location: "Community Arts Center, Miami",
        eventDate: new Date("2026-10-08T18:00:00Z"),
        creatorEmail: "art@communitycenter.com",
        createdAt: new Date()
    }
];

const sampleUsers = [
    {
        email: "john@example.com",
        displayName: "John Doe",
        photoURL: "",
        role: "user",
        createdAt: new Date(),
        lastLogin: new Date()
    },
    {
        email: "jane@example.com",
        displayName: "Jane Smith",
        photoURL: "",
        role: "organizer",
        createdAt: new Date(),
        lastLogin: new Date()
    },
    {
        email: "admin@socialevents.com",
        displayName: "Admin User",
        photoURL: "",
        role: "admin",
        createdAt: new Date(),
        lastLogin: new Date()
    }
];

async function seedDatabase() {
    try {
        await client.connect();
        const db = client.db('social-events');
        const eventsCollection = db.collection('events');
        const usersCollection = db.collection('users');

        console.log('🌱 Seeding database...');

        await eventsCollection.deleteMany({});
        await usersCollection.deleteMany({});

        // Insert sample events
        const eventsResult = await eventsCollection.insertMany(sampleEvents);
        console.log(`✅ Inserted ${eventsResult.insertedCount} events`);

        // Insert sample users
        for (const user of sampleUsers) {
            await usersCollection.updateOne(
                { email: user.email },
                {
                    $set: {
                        displayName: user.displayName,
                        photoURL: user.photoURL,
                        role: user.role,
                        lastLogin: user.lastLogin
                    },
                    $setOnInsert: {
                        email: user.email,
                        createdAt: user.createdAt
                    }
                },
                { upsert: true }
            );
        }

        console.log('🎉 Database seeded successfully!');
    } catch (error) {
        console.error('❌ Error seeding database:', error);
    } finally {
        await client.close();
    }
}

seedDatabase();