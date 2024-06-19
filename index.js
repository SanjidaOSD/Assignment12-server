const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5000;
// middleware
app.use(
    cors({
        origin: [
            "http://localhost:5173",
            "http://localhost:4173",
            "https://pethousebd.netlify.app",
        ]
    })
);
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
        // await client.connect();

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

        // use verify admin after verifyToken
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            const isAdmin = user?.role === 'admin';
            if (!isAdmin) {
                return res.status(403).send({ message: 'Forbidden Access' });
            }
            next();
        }

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
            const existUser = await userCollection.findOne(query);
            if (existUser) {
                return res.send({ message: 'User Exist', insertedId: null })
            }
            const result = await userCollection.insertOne(user);
            res.send(result);
        });

        // Update user role
        app.patch('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    role: "admin"
                }
            }
            const result = await userCollection.updateOne(query, updateDoc)
            res.send(result)
        })


        //=================  Pet Collection related api =================

        // Insert a new pet data to db
        app.post('/pet', verifyToken, async (req, res) => {
            const newPet = req.body;
            const result = await petCollection.insertOne(newPet);
            res.send(result)
        })

        // Get all pets data from db
        app.get('/pets', async (req, res) => {
            const search = req.query.search || "";
            const size = parseInt(req.query.limit);
            const page = parseInt(req.query.skip);
            const category = req.query.category || ""; 

            let query = {
                petName: { $regex: search, $options: 'i' }
            }
            if (category) {
                query.category = category;
            }

            try {
                const result = await petCollection.find(query)
                    .sort({ category: 1 }) 
                    .limit(size)
                    .skip(page)
                    .toArray();
                res.send(result);
            } catch (error) {
                console.error("Error fetching pets:", error);
                res.status(500).send("Error fetching pets");
            }
        });



        // Get all added pet for specific user email
        app.get('/my-added-pets/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            const result = await petCollection.find({ email }).toArray()
            res.send(result)
        })

        // Get single pet data by _id
        app.get('/pet-data/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await petCollection.findOne(query)
            res.send(result)
        })

        // Update a pet data to db
        app.patch('/pet-data-update/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const pet = req.body;
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
        app.delete('/pet-data-delete/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await petCollection.deleteOne(query);
            res.send(result)
        })

        //=================  Campaign Collection related api =================

        //Create a new campaign to DB
        app.post('/create-campaign', verifyToken, async (req, res) => {
            const newCampaign = req.body;
            const result = await campaignCollection.insertOne(newCampaign)
            res.send(result)
        })

        //Get all donation campaigns from DB
        app.get('/donationCampaigns', async (req, res) => {
            const size = parseInt(req.query.limit);
            const page = parseInt(req.query.skip);
            const result = await campaignCollection.find().limit(size).skip(page).toArray()
            res.send(result)
        })

        //Get donation campaign details from DB
        app.get('/donation-campaign-details/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await campaignCollection.findOne(query)
            res.send(result)
        })

        //Delete donation campaign  from DB
        app.delete('/donation-campaign/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await campaignCollection.deleteOne(query)
            res.send(result)
        })

        //Get donation campaigns from DB by specific Email
        app.get('/donation-campaigns/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            const query = { campaignCreator: email }
            const result = await campaignCollection.find(query).toArray()
            res.send(result)
        })

        // update campaign total donation amount and donators data after a single payment
        app.patch(`/payment-update-campaign/:id`, verifyToken, async (req, res) => {
            const id = req.params.id;
            const updateData = req.body;
            const query = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    totalDonatedAmount: updateData.totalDonatedAmount,
                    donators: [...updateData.donators]
                }
            }
            const result = await campaignCollection.updateOne(query, updatedDoc)
            res.send(result)
        })

        // update campaign data
        app.patch(`/update-campaign/:id`, verifyToken, async (req, res) => {
            const id = req.params.id;
            const updateData = req.body;
            const query = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    ...updateData
                }
            }
            const result = await campaignCollection.updateOne(query, updatedDoc)
            res.send(result)
        })

        // Make true Pause Status of campaign
        app.patch(`/pause-true/:id`, verifyToken, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    pauseStatus: true
                }
            }
            const result = await campaignCollection.updateOne(query, updatedDoc)
            res.send(result)
        })

        // Make false Pause Status of campaign
        app.patch(`/pause-false/:id`, verifyToken, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    pauseStatus: false
                }
            }
            const result = await campaignCollection.updateOne(query, updatedDoc)
            res.send(result)
        })



        //=================  Adopt Request related api =================

        // create a new adopt in db
        app.post('/adopt-request', verifyToken, async (req, res) => {
            const newRequest = req.body;
            const result = await adoptCollection.insertOne(newRequest);
            res.send(result)
        })

        // get all adoption request from db
        app.get('/adopt-request', verifyToken, async (req, res) => {
            const result = await adoptCollection.find().toArray();
            res.send(result)
        })

        // remove a adoption request from db
        app.delete('/adopt-request/:id', verifyToken, async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = await adoptCollection.deleteOne(query)
            res.send(result)
        })

        // Accept a adopt request
        app.patch('/accept-adopt-request/:id', verifyToken, async (req, res) => {
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
        app.post('/payment-intent', verifyToken, async (req, res) => {
            const { fees } = req.body;
            const amount = parseInt(fees * 100)
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            })
            res.send({
                clientSecret: paymentIntent?.client_secret
            })
        })

        //=================  Payment Collection related api =================

        // Create a payment data for donated amount in db
        app.post('/donation-payment', verifyToken, async (req, res) => {
            const newDonation = req.body;
            const result = await paymentCollection.insertOne(newDonation);
            res.send(result)
        })

        // get payment data for donated user email
        app.get('/donation-payment/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            const query = { userEmail: email }
            const result = await paymentCollection.find(query).toArray();
            res.send(result)
        })

        // Delete a payment data from db
        app.delete('/delete-donation/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await paymentCollection.deleteOne(query)
            res.send(result)
        })

        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
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