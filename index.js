const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5000;
console.log(process.env.STRIPE_SECRET_KEY);
// middleware
app.use(cors());
app.use(express.json());

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

        //=================  Database Collections =================

        const userCollection = client.db("pethouse").collection("users");
        const petCollection = client.db("pethouse").collection("pets");
        const campaignCollection = client.db("pethouse").collection("campaign");
        const adoptCollection = client.db("pethouse").collection("adopt");
        const paymentCollection = client.db("pethouse").collection("payment");

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

        //=================  Pet Collection related api =================

        // Insert a new pet data to db
        app.post('/pet', async (req, res) => {
            const newPet = req.body;
            const result = await petCollection.insertOne(newPet);
            res.send(result)
        })
        // Get all pets data from db
        app.get('/pets', async (req, res) => {
            const result = await petCollection.find().toArray()
            res.send(result)
        })

        // Get all added pet for specific user email
        app.get('/my-added-pets/:email', async (req, res) => {
            const email = req.params.email;
            const result = await petCollection.find({ email }).toArray()
            res.send(result)
        })

        // Get single pet data by _id
        app.get('/pet-data/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await petCollection.findOne(query)
            res.send(result)
        })

        // Update a pet data to db
        app.patch('/pet-data-update/:id', async (req, res) => {
            const id = req.params.id;
            const pet = req.body;
            console.log(pet);
            const query = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    ...pet
                }
            }
            const result = await petCollection.updateOne(query, updateDoc);
            res.send(result)
        })

        // Delete a pet data from db
        app.delete('/pet-data-delete/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await petCollection.deleteOne(query);
            res.send(result)
        })

        //=================  Campaign Collection related api =================

        //Create a new campaign to DB
        app.post('/create-campaign', async (req, res) => {
            const newCampaign = req.body;
            const result = await campaignCollection.insertOne(newCampaign)
            res.send(result)
        })

        //Get all donation campaigns from DB
        app.get('/donation-campaign', async (req, res) => {
            const result = await campaignCollection.find().toArray()
            res.send(result)
        })

        //Get donation campaign details from DB
        app.get('/donation-campaign-details/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await campaignCollection.findOne(query)
            res.send(result)
        })


        //=================  Adopt Request related api =================

        // create a new adopt in db
        app.post('/adopt-request', async (req, res) => {
            const newRequest = req.body;
            console.log(newRequest);
            const result = await adoptCollection.insertOne(newRequest);
            res.send(result)
        })

        // get all adoption request from db
        app.get('/adopt-request', async (req, res) => {
            const result = await adoptCollection.find().toArray();
            res.send(result)
        })

        // remove a adoption request from db
        app.delete('/adopt-request/:id', async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = await adoptCollection.deleteOne(query)
            res.send(result)
        })

        // Accept a adopt request
        app.patch('/accept-adopt-request/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    status: "accepted"
                }
            }
            const result = await adoptCollection.updateOne(query, updateDoc)
            res.send(result)
        })

        //=================  Payment related api =================

        // Make a payment
        app.post('/payment-intent', async (req, res) => {
            const { fees } = req.body;
            console.log(fees);
            const amount = parseInt(fees * 100)
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            })
            console.log(paymentIntent);
            res.send({
                clientSecret: paymentIntent?.client_secret
            })
        })

        // Create a payment data for donated amount in db
        app.post('/donation-payment', async(req, res)=>{
            const newDonation = req.body;
            const result = await paymentCollection.insertOne(newDonation);
            res.send(result)
        })

        // get payment data for donated user email
        app.get('/donation-payment/:email', async(req, res)=>{
            const email = req.params.email;
            console.log(email);
            const query = {userEmail : email}
            const result = await paymentCollection.find(query).toArray();
            console.log(result);
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