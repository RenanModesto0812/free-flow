// ====================================================
// 1. CONFIGURAÇÃO E IMPORTAÇÕES
// ====================================================

const express = require('express');
const cors = require('cors'); 
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = 3000; 

// --- CREDENCIAIS SUPABASE (SUBSTITUA!) ---
const SUPABASE_URL = 'https://keklkdsiktkpbihhksro.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtla2xrZHNpa3RrcGJpaGhrc3JvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMyNjIxNzYsImV4cCI6MjA3ODgzODE3Nn0.Aadwh_qBeaZGUWYjh_DqxurPdPo2uwljHBLv-f51vAU';

// Inicializa o Cliente Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Middlewares
app.use(cors());
app.use(express.json());


// ====================================================
// 2. MIDDLEWARE DE PROTEÇÃO (AUTENTICAÇÃO)
// ====================================================
// Esta função verifica se o usuário está logado ANTES de acessar rotas privadas.

const protect = async (req, res, next) => {
    // 1. O Token JWT deve vir no cabeçalho "Authorization"
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ message: 'Acesso negado. Token não fornecido.' });
    }

    // 2. Extrai o Token (ignora o "Bearer ")
    const token = authHeader.split(' ')[1];
    
    // 3. Verifica o Token usando o Supabase
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
        // Se o token for inválido, expirado ou o usuário não for encontrado
        return res.status(401).json({ message: 'Token inválido ou expirado.' });
    }

    // 4. Se o Token for válido, anexa o ID do usuário à requisição
    req.user = data.user; 
    
    // Continua para a próxima função (a rota original)
    next(); 
};


// ====================================================
// 3. ROTAS DE AUTENTICAÇÃO (PÚBLICAS)
// ====================================================

// ⭐️ MODIFICAÇÃO 1: ADICIONAR ROTA RAIZ (/)
// Isso resolve o erro "Cannot GET /"
app.get('/', (req, res) => {
    res.status(200).json({ 
        message: 'API de Finanças FreeFlow está operacional!',
        status: 'OK'
    });
});

// ROTA DE CADASTRO (SIGN UP)
app.post('/api/cadastro', async (req, res) => {
    const { email, senha, nome } = req.body;
    
    // Tenta criar o usuário no Supabase
    const { data: user, error } = await supabase.auth.signUp({
        email: email,
        password: senha,
        // Adiciona o nome nos metadados do usuário
        options: { data: { nome_completo: nome } }
    });

    if (error) {
        return res.status(400).json({ message: error.message });
    }

    // Cria um perfil inicial (na sua tabela profiles) após o cadastro
    const { error: profileError } = await supabase
        .from('profiles')
        .insert({ id: user.user.id, nome_completo: nome });
    
    if (profileError) {
        console.error('Erro ao criar perfil:', profileError);
    }
    
    res.status(201).json({ 
        message: 'Cadastro realizado com sucesso! Verifique seu e-mail (se ativado) e faça login.',
        user_id: user.user.id 
    });
});


// ROTA DE LOGIN (SIGN IN)
app.post('/api/login', async (req, res) => {
    const { email, senha } = req.body;
    
    // Autentica o usuário com e-mail e senha
    const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: senha,
    });

    if (error) {
        return res.status(401).json({ message: 'E-mail ou senha inválidos.' });
    }

    // Sucesso: Retorna o Token (acess_token) e o usuário
    res.json({
        message: 'Login realizado com sucesso!',
        token: data.session.access_token, // Este é o Token JWT que o Front-end deve salvar
        plano: 'Gratuito' // Busca real viria do DB
    });
});


// ====================================================
// 4. ROTAS DE DADOS (PROTEGIDAS)
// ====================================================

// ROTA PARA REGISTRAR NOVA RECEITA
// Note o uso do middleware 'protect' antes da função da rota!
app.post('/api/receitas', protect, async (req, res) => {
    // Se chegou aqui, o usuário está logado e req.user contém o ID
    const novaReceitaData = req.body;
    const user_id = req.user.id; // Pega o ID do usuário validado

    // Insere no banco de dados Supabase (tabela 'revenues')
    const { data, error } = await supabase
        .from('revenues')
        .insert({ 
            ...novaReceitaData, 
            user_id: user_id 
        });

    if (error) {
        console.error("Erro ao salvar a receita:", error);
        return res.status(500).json({ message: 'Erro ao registrar a receita: ' + error.message });
    }

    res.status(201).json({ 
        message: 'Receita registrada com sucesso!', 
        data: data 
    });
});
// server.js (Certifique-se de que esta rota exista e esteja correta!)

// ROTA PARA REGISTRAR NOVA DESPESA
app.post('/api/despesas', protect, async (req, res) => {
    // Se chegou aqui, o usuário está logado
    const novaDespesaData = req.body;
    const user_id = req.user.id; // Pega o ID do usuário validado

    // Insere no banco de dados Supabase (tabela 'expenses')
    // Atenção ao nome da tabela: 'expenses'
    const { data, error } = await supabase
        .from('expenses')
        .insert({ 
            ...novaDespesaData, 
            user_id: user_id 
        });

    if (error) {
        console.error("Erro ao salvar a despesa:", error);
        return res.status(500).json({ message: 'Erro ao registrar a despesa: ' + error.message });
    }

    res.status(201).json({ 
        message: 'Despesa registrada com sucesso!', 
        data: data 
    });
});

// ROTA PARA OBTER TODOS OS LANÇAMENTOS DO USUÁRIO
app.get('/api/lancamentos', protect, async (req, res) => {
    const user_id = req.user.id; 

    // Busca todas as receitas e despesas (Supabase faz o filtro automático com RLS)
    const { data: receitas, error: receitaError } = await supabase
        .from('revenues')
        .select('*')
        .eq('user_id', user_id); // Filtra pela coluna user_id

    const { data: despesas, error: despesaError } = await supabase
        .from('expenses')
        .select('*')
        .eq('user_id', user_id); // Filtra pela coluna user_id

    if (receitaError || despesaError) {
        console.error("Erro ao buscar lançamentos:", receitaError || despesaError);
        return res.status(500).json({ message: 'Erro ao buscar dados.' });
    }

    // Combina e retorna os dados para o Front-end
    const lancamentos = [...receitas, ...despesas].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json(lancamentos);
});


// ====================================================
// 5. INICIAR O SERVIDOR
// ====================================================

// ❌ MODIFICAÇÃO 2: REMOVER A ESCUTA DE PORTA LOCAL
/*
app.listen(PORT, () => {
    console.log(`Servidor FreeFlow rodando em http://localhost:${PORT}`);
    console.log('Use Ctrl + C para parar o servidor.');
});
*/

// 🚀 MODIFICAÇÃO 3: ADICIONAR O EXPORT PARA O VERCEL
// Isso permite que o Vercel use este arquivo como uma função Serverless.
module.exports = app;
