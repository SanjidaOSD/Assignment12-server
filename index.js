const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
// const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());



const { MongoClient, ServerApiVersion } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.2bg42lh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        // Database Colletions
        const userCollection = client.db("pethouse").collection("users");
        const petCollection = client.db("pethouse").collection("pets");

        app.get('/', async (req, res) => {
            res.send('Pet house is running...')
        })

        //=================  JWT related api =================
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '12h' });
            res.send({ token });
        })

        //================= Middlewares =================
        // Token verification
        const verifyToken = (req, res, next) => {
            if (!req.headers.authorization) {
                return res.status(401).send({ message: 'Unauthorized Access' });
            }
            const token = req.headers.authorization.split(' ')[1];
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: 'Unauthorized Access' })
                }
                req.decoded = decoded;
                next();
            })
        }

        // Check admin verification
        app.get('/users/admin/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            if (email !== req.decoded.email) {
                return res.status(403).send({ message: 'Forbidden Access' })
            }
            const query = { email: email };
            const user = await userCollection.findOne(query);
            let admin = false;
            if (user) {
                admin = user?.role === 'admin';
            }
            res.send({ admin });
        })

        //=================  User related api =================
        //Get all user from db
        app.get('/users', async (req, res) => {
            const result = await userCollection.find().toArray();
            res.send(result);
        });

        // Check a user is exist in db or not and post a new user
        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email }
            const existstUser = await userCollection.findOne(query);
            if (existstUser) {
                return res.send({ message: 'User Exist', insertedId: null })
            }
            const result = await userCollection.insertOne(user);
            res.send(result);
        });

        // Insert a new pet data to db
        app.post('/pet', async(req, res)=>{
            const newPet = req.body;
            const result = await petCollection.insertOne(newPet);
            res.send(result)
        })

        // Get all added pet for specific user email
        app.get('/my-added-pets/:email', async(req, res)=>{
            const email = req.params.email;
            const result = await petCollection.find({email}).toArray()
            res.send(result)
        })


        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}

run().catch(console.dir);

app.listen(port, () => {
    console.log(`Pet House is running on port : ${port}`);
})