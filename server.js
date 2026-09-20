require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
let onlineUsers = {};

app.post('/api/register', async (req, res) => {
  const { username, password, role, displayName } = req.body;
  const hash = await bcrypt.hash(Buffer.from(password, 'utf8').toString('binary'), 10);
  const color = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
  const { data, error } = await supabase.from('users').insert({
    username, password_hash: hash, role: role || 'student',
    display_name: displayName || username, avatar_color: color
  }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const { data: user } = await supabase.from('users').select('*').eq('username', username).maybeSingle();
  if (!user || !(await bcrypt.compare(Buffer.from(password, 'utf8').toString('binary'), user.password_hash))) {
    return res.status(401).json({ error: 'Неверный логин или пароль' });
  }
  res.json(user);
});

app.get('/api/assignments', async (req, res) => {
  const { data } = await supabase.from('assignments').select('*').order('created_at', { ascending: false });
  res.json(data || []);
});

app.post('/api/assignments', async (req, res) => {
  const { title, description, subject, due_date, created_by } = req.body;
  const { data } = await supabase.from('assignments').insert({ title, description, subject, due_date, created_by }).select().single();
  res.json(data);
});

app.get('/api/grades/:username', async (req, res) => {
  const { data } = await supabase.from('grades').select('*').eq('student_username', req.params.username).order('created_at', { ascending: false });
  res.json(data || []);
});

app.post('/api/grades', async (req, res) => {
  const { student_username, subject, grade, comment } = req.body;
  const { data } = await supabase.from('grades').insert({ student_username, subject, grade, comment }).select().single();
  res.json(data);
});

app.post('/api/homework', async (req, res) => {
  const { assignment_id, student_username, student_display_name, content } = req.body;
  const { data } = await supabase.from('homework_submissions').insert({ assignment_id, student_username, student_display_name, content }).select().single();
  res.json(data);
});

app.get('/api/homework/:assignment_id', async (req, res) => {
  const { data } = await supabase.from('homework_submissions').select('*').eq('assignment_id', req.params.assignment_id);
  res.json(data || []);
});

app.patch('/api/homework/:id', async (req, res) => {
  const { status } = req.body;
  const { data } = await supabase.from('homework_submissions').update({ status }).eq('id', req.params.id).select().single();
  res.json(data);
});

app.get('/api/messages', async (req, res) => {
  const { data } = await supabase.from('messages').select('*').order('created_at', { ascending: true }).limit(100);
  res.json(data || []);
});

io.on('connection', (socket) => {
  socket.on('join', (username) => {
    onlineUsers[username] = socket.id;
    io.emit('user_list', Object.keys(onlineUsers));
  });
  socket.on('send_message', async (data) => {
    const { sender_username, sender_display_name, content } = data;
    const { data: msg } = await supabase.from('messages').insert({ sender_username, sender_display_name, content }).select().single();
    if (msg) io.emit('receive_message', msg);
  });
  socket.on('disconnect', () => {
    for (const [user, id] of Object.entries(onlineUsers)) {
      if (id === socket.id) { delete onlineUsers[user]; break; }
    }
    io.emit('user_list', Object.keys(onlineUsers));
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✅ School LMS running on http://localhost:${PORT}`));
