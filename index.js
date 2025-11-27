// Configuração do Servidor Express e Supabase para o App "Sabor & Arte"
// Modo de Módulos ES (import)

// 1. Importações
import 'dotenv/config'; 
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

// Define variáveis de caminho para compatibilidade com Módulos ES
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// 2. Inicialização do Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

// Verifica se as chaves estão configuradas
if (!supabaseUrl || !supabaseAnonKey) {
  console.error("ERRO: As variáveis SUPABASE_URL e SUPABASE_ANON_KEY não estão configuradas no .env.");
  console.error("Por favor, crie um arquivo .env na raiz do projeto e adicione suas chaves.");
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 3. Middlewares Essenciais
app.use(express.json()); // Habilita o parsing de JSON no corpo da requisição

// Configura para servir arquivos estáticos.
// ATENÇÃO: Se suas pastas 'Telas/Telas/' estiverem em 'public', o caminho está correto.
// O acesso será: http://localhost:3000/Telas/Login/login.html
app.use(express.static(path.join(__dirname, 'public'))); 
app.use('/Telas', express.static(path.join(__dirname, 'Telas'))); // Rota adicional para as pastas internas

// 4. Middleware de Autenticação
// Verifica se o token de autorização é válido no Supabase
const requireAuth = async (req, res, next) => {
    // O token é esperado no formato "Bearer <token>"
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Acesso negado. Token não fornecido.' });
    }

    // Usa o token para obter o usuário do Supabase
    const { data: userAuth, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !userAuth.user) {
        // Se o token for inválido, expirado ou não encontrar o usuário
        return res.status(401).json({ error: 'Token inválido ou expirado.' });
    }
    
    // Anexa o ID do usuário à requisição para uso nas rotas protegidas
    req.userId = userAuth.user.id;
    next();
};


// 5. ROTAS DA API

// A. Rota de Teste Simples (Rota Raiz)
app.get('/', (req, res) => {
    // Redireciona para a tela de login/cardápio
    // Assumindo que a pasta 'Telas/Telas/Login' contém o 'login.html'
    res.redirect('/Telas/Login/login.html'); 
});


// B. ROTAS DE AUTENTICAÇÃO (Cadastro e Login)
// Baseado em 'cadastro.html' e 'login.html'

// B1. Cadastro (POST /api/auth/register) - Baseado em 'cadastro.html'
app.post('/api/auth/register', async (req, res) => {
    // Espera os campos: email, password, nome, telefone (telefone não está no HTML, mas é comum)
    const { email, password, nome, telefone } = req.body; 

    if (!email || !password || !nome) {
        return res.status(400).json({ error: 'Campos obrigatórios faltando.' });
    }

    try {
        // 1. Cadastra o usuário no Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password,
        });

        if (authError) throw authError;

        // 2. Insere dados adicionais na tabela 'perfis'
        const newUserId = authData.user.id;
        const { error: profileError } = await supabase
            .from('perfis')
            .insert([
                { 
                    id: newUserId,
                    nome, 
                    email,
                    telefone: telefone || null // Telefone é opcional aqui
                }
            ]);

        if (profileError) {
            console.error("Erro ao salvar perfil, mas Auth OK:", profileError);
            return res.status(500).json({ error: 'Usuário criado, mas falha ao salvar dados adicionais.' });
        }

        // Retorna sucesso e o token de sessão
        res.status(201).json({ 
            message: 'Cadastro realizado com sucesso!',
            token: authData.session.access_token 
        });

    } catch (error) {
        // Captura erros de email já registrado ou senha fraca
        res.status(400).json({ error: error.message || 'Erro no processo de cadastro.' });
    }
});

// B2. Login (POST /api/auth/login) - Baseado em 'login.html'
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email e senha são obrigatórios.' });
    }

    const { data: authData, error } = await supabase.auth.signInWithPassword({
        email,
        password,
    });

    if (error) {
        return res.status(401).json({ error: 'Credenciais inválidas: ' + error.message });
    }

    // Retorna o token
    res.status(200).json({ 
        message: 'Login realizado com sucesso!',
        token: authData.session.access_token 
    });
});


// C. ROTAS DO CARDÁPIO
// Baseado em 'lista_pratos.html' e 'Cardapio.pdf'

// C1. Listar Cardápio (GET /api/menu)
app.get('/api/menu', async (req, res) => {
    // Recomenda-se ter uma tabela 'menu' ou 'lanches' com colunas:
    // id, name, description, price, category ('Pratos Principais', 'Bebidas', 'Sobremesas'), image_url

    const { data: menu, error } = await supabase
        .from('menu') 
        .select('*')
        .order('category', { ascending: true }) // Ordena por categoria primeiro
        .order('id', { ascending: true });      // Depois por ordem de item
        
    if (error) {
        console.error('Erro ao buscar cardápio:', error);
        return res.status(500).json({ error: 'Falha ao carregar o cardápio.' });
    }

    // Opcional: Agrupar por categoria para facilitar o uso no frontend
    const groupedMenu = menu.reduce((acc, item) => {
        const category = item.category || 'Outros';
        if (!acc[category]) {
            acc[category] = [];
        }
        acc[category].push(item);
        return acc;
    }, {});


    res.status(200).json(groupedMenu);
});


// D. ROTAS DE PEDIDOS (Carrinho)
// Baseado em 'carrinho_vazio.html' (e futuras telas de carrinho cheio)
// Requer autenticação (requireAuth)

// D1. Criar Novo Pedido (POST /api/pedidos)
app.post('/api/pedidos', requireAuth, async (req, res) => {
    const { items, total } = req.body; 
    const userId = req.userId; // ID do usuário do token
    
    if (!items || !total) {
        return res.status(400).json({ error: 'O carrinho está vazio ou o total está faltando.' });
    }
    
    // items: Deve ser um array de objetos [{ item_id, quantity, price }]
    
    const { data: pedido, error } = await supabase
        .from('pedidos') // Assegure-se de ter uma tabela 'pedidos'
        .insert([{
            user_id: userId,
            items_json: JSON.stringify(items), // Salva o array de itens como JSON na coluna
            total: total,
            status: 'Pendente' 
        }])
        .select(); 

    if (error) {
        console.error('Erro ao inserir pedido:', error);
        return res.status(500).json({ error: 'Falha ao finalizar o pedido.' });
    }

    res.status(201).json({ message: 'Pedido finalizado com sucesso!', pedido: pedido[0] });
});

// D2. Listar Pedidos do Usuário (GET /api/pedidos)
app.get('/api/pedidos', requireAuth, async (req, res) => {
    const userId = req.userId;

    const { data: pedidos, error } = await supabase
        .from('pedidos')
        .select('id, total, status, created_at, items_json') // Seleciona as colunas relevantes
        .eq('user_id', userId) 
        .order('created_at', { ascending: false }); // Pedidos mais recentes primeiro

    if (error) {
      console.error('Erro ao buscar pedidos:', error);
      return res.status(500).json({ error: 'Falha ao carregar seus pedidos.' });
    }

    // Opcional: Parseia a string JSON de volta para objeto
    const pedidosFormatados = pedidos.map(p => ({
        ...p,
        items: JSON.parse(p.items_json) // Assume que 'items_json' armazena o array de itens
    }));


    res.status(200).json(pedidosFormatados);
});


// 6. Inicializa o Servidor
app.listen(PORT, () => {
  console.log('--- Servidor Sabor & Arte Iniciado ---');
  console.log(`🚀 Express rodando em http://localhost:${PORT}`);
  console.log('Rotas de API prontas para uso: /api/auth/register, /api/menu, /api/pedidos, etc.');
  console.log('--------------------------------------');
});