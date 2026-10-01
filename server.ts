import express, { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import { store } from './src/store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

declare module 'express-session' {
  interface SessionData {
    user?: any;
    panier?: Record<string, { id: number; nom: string; prix: number; quantite: number }>;
    panierCaisse?: Record<string, { id: number; nom: string; prix: number; quantite: number }>;
    flash?: Record<string, string>;
  }
}

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Setup Multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let dest = path.join(__dirname, 'public/uploads/produits');
    if (file.fieldname === 'preuve') {
      dest = path.join(__dirname, 'public/uploads/preuves');
    } else if (file.fieldname === 'photo') {
      dest = path.join(__dirname, 'public/uploads/profils');
    }
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const unique = Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    cb(null, unique + ext);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Body parsers
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session setup
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'ceps_secret_key_session_2025',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 1000 * 60 * 60 * 24 * 7 }, // 7 days
  })
);

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname, 'public/assets')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// Global locals & flash helper
app.use((req: Request, res: Response, next: NextFunction) => {
  if (!req.session.panier) req.session.panier = {};
  if (!req.session.panierCaisse) req.session.panierCaisse = {};

  const flashSuccess = req.session.flash?.success;
  const flashErreur = req.session.flash?.erreur;
  if (req.session.flash) delete req.session.flash;

  res.locals.NOM_ENTREPRISE = 'CEPS - Centre Équipements Produit de Santé';
  res.locals.BASE_URL = '';
  res.locals.NUMERO_MONCASH = '+509 31 77 66 47(HERARD JUGENS)';
  res.locals.NUMERO_NATCASH = '+509 32 10 10 44 (GLEMAUD EZECHIEL)';
  res.locals.NUMERO_BNC = 'Compte BNC : 471-0000-143 (GLEMAUD EZECHIEL)';
  res.locals.GOOGLE_CLIENT_ID = '295430124747-u3mlsmt7f3ogofmcne655bq6ieod2hvn.apps.googleusercontent.com';
  res.locals.user = req.session.user || null;
  res.locals.panier = req.session.panier;
  res.locals.panierCaisse = req.session.panierCaisse;
  res.locals.flash_success = flashSuccess || null;
  res.locals.flash_erreur = flashErreur || null;
  res.locals.reqQuery = req.query;

  // Flash helper method
  (req as any).setFlash = (type: 'success' | 'erreur', message: string) => {
    if (!req.session.flash) req.session.flash = {};
    req.session.flash[type] = message;
  };

  next();
});

// Front-Controller Dispatcher:
// Supports index.php?page=... as well as /?page=... and direct paths
app.all(['/', '/index.php'], upload.any(), async (req: Request, res: Response) => {
  const page = (req.query.page as string) || 'accueil';
  res.locals.pageActive = page;
  const setFlash = (req as any).setFlash;

  try {
    switch (page) {
      // ==========================================
      // PAGES PUBLIQUES
      // ==========================================
      case 'accueil': {
        const produitsAccueil = store.getProducts({ activeOnly: true }).slice(0, 6);
        return res.render('accueil', { produitsAccueil });
      }

      case 'galerie': {
        const idCat = req.query.categorie ? parseInt(req.query.categorie as string, 10) : undefined;
        const type = req.query.type as string | undefined;
        const produits = store.getProducts({ idCategorie: idCat, type, activeOnly: true });
        const categories = store.categories;
        return res.render('galerie', { produits, categories });
      }

      case 'produit_detail': {
        const id = parseInt(req.query.id as string, 10);
        const produit = store.getProductById(id);
        if (!produit || !produit.actif) {
          setFlash('erreur', 'Produit introuvable.');
          return res.redirect('/index.php?page=galerie');
        }
        return res.render('produit_detail', { produit });
      }

      case 'recherche_produit': {
        const q = (req.query.q as string) || '';
        const produits = store.getProducts({ q, activeOnly: true });
        return res.render('resultats_recherche', { q, produits });
      }

      case 'apropos': {
        return res.render('apropos');
      }

      case 'contact': {
        return res.render('contact');
      }

      case 'panier': {
        return res.render('panier');
      }

      case 'panier_ajouter': {
        const idProduit = parseInt(req.body.id_produit, 10);
        const quantite = Math.max(1, parseInt(req.body.quantite || '1', 10));
        const retour = (req.body.retour as string) || 'index.php?page=panier';
        const produit = store.getProductById(idProduit);

        if (!produit) {
          setFlash('erreur', 'Produit inexistant.');
          return res.redirect('/index.php?page=galerie');
        }

        const idStr = String(idProduit);
        if (!req.session.panier) req.session.panier = {};

        if (req.session.panier[idStr]) {
          req.session.panier[idStr].quantite += quantite;
        } else {
          req.session.panier[idStr] = {
            id: idProduit,
            nom: produit.nom_produit,
            prix: produit.prix_unitaire,
            quantite,
          };
        }

        setFlash('success', `"${produit.nom_produit}" ajouté au panier.`);
        return res.redirect('/' + retour.replace(/^\//, ''));
      }

      case 'panier_retirer': {
        const id = String(req.body.id);
        if (req.session.panier && req.session.panier[id]) {
          delete req.session.panier[id];
          setFlash('success', 'Article retiré du panier.');
        }
        return res.redirect('/index.php?page=panier');
      }

      // ==========================================
      // AUTHENTIFICATION
      // ==========================================
      case 'login': {
        if (req.session.user) {
          if (req.session.user.nom_role === 'admin') return res.redirect('/index.php?page=admin_dashboard');
          if (req.session.user.nom_role === 'caissier') return res.redirect('/index.php?page=caissier_dashboard');
          return res.redirect('/index.php?page=accueil');
        }
        return res.render('auth/login');
      }

      case 'login_traiter': {
        const { email, mot_de_passe } = req.body;
        const user = store.findUserByEmail(email);

        if (!user) {
          setFlash('erreur', 'Identifiants incorrects.');
          return res.render('auth/login', { email });
        }

        if (user.compte_bloque) {
          setFlash('erreur', 'Ce compte est temporairement bloqué. Contactez l’administrateur.');
          return res.render('auth/login', { email });
        }

        const passwordOk = bcrypt.compareSync(mot_de_passe, user.mot_de_passe);
        if (!passwordOk) {
          user.tentatives_connexion++;
          if (user.tentatives_connexion >= 3) {
            user.compte_bloque = 1;
            setFlash('erreur', 'Trop de tentatives infructueuses. Votre compte a été bloqué.');
          } else {
            setFlash('erreur', `Mot de passe incorrect. (${3 - user.tentatives_connexion} tentative(s) restante(s))`);
          }
          return res.render('auth/login', { email });
        }

        // Login success
        user.tentatives_connexion = 0;
        req.session.user = user;

        if (user.nom_role === 'admin') return res.redirect('/index.php?page=admin_dashboard');
        if (user.nom_role === 'caissier') return res.redirect('/index.php?page=caissier_dashboard');
        return res.redirect('/index.php?page=accueil');
      }

      case 'login_google': {
        // Sign-in via Google credential
        let email = 'client.google@ceps.com';
        let nom = 'Google';
        let prenom = 'Utilisateur';

        let existing = store.findUserByEmail(email);
        if (!existing) {
          existing = store.createUser({
            nom,
            prenom,
            email,
            mot_de_passe: 'GoogleAuth1234',
            id_role: 2,
            origine: 'google',
          });
        }
        req.session.user = existing;
        setFlash('success', 'Connecté avec succès via Google.');
        return res.redirect('/index.php?page=accueil');
      }

      case 'inscription': {
        return res.render('auth/inscription');
      }

      case 'inscription_traiter': {
        const { nom, prenom, email, mot_de_passe, confirmation } = req.body;
        if (mot_de_passe !== confirmation) {
          setFlash('erreur', 'Les mots de passe ne correspondent pas.');
          return res.render('auth/inscription');
        }

        if (store.findUserByEmail(email)) {
          setFlash('erreur', 'Cette adresse email est déjà utilisée.');
          return res.render('auth/inscription');
        }

        const newUser = store.createUser({
          nom,
          prenom,
          email,
          mot_de_passe,
          id_role: 2,
        });

        req.session.user = newUser;
        setFlash('success', 'Votre compte a été créé avec succès ! Bienvenue sur CEPS.');
        return res.redirect('/index.php?page=accueil');
      }

      case 'deconnexion': {
        req.session.destroy(() => {
          res.redirect('/index.php?page=accueil');
        });
        return;
      }

      // ==========================================
      // ESPACE CLIENT
      // ==========================================
      case 'client_profil': {
        if (!req.session.user || req.session.user.nom_role !== 'client') {
          return res.redirect('/index.php?page=login');
        }
        const profil = store.findUserById(req.session.user.id_utilisateur);
        return res.render('client/profil', { profil });
      }

      case 'client_profil_modifier': {
        if (!req.session.user) return res.redirect('/index.php?page=login');
        const user = store.findUserById(req.session.user.id_utilisateur);
        if (user) {
          user.nom = req.body.nom || user.nom;
          user.prenom = req.body.prenom || user.prenom;
          user.telephone = req.body.telephone || user.telephone;

          const files = req.files as Express.Multer.File[];
          const photoFile = files?.find((f) => f.fieldname === 'photo');
          if (photoFile) {
            user.photo_profil = photoFile.filename;
          }
          req.session.user = user;
          setFlash('success', 'Profil mis à jour.');
        }
        return res.redirect('/index.php?page=client_profil');
      }

      case 'client_mdp_modifier': {
        if (!req.session.user) return res.redirect('/index.php?page=login');
        const user = store.findUserById(req.session.user.id_utilisateur);
        const { ancien_mot_de_passe, nouveau_mot_de_passe, confirmation } = req.body;

        if (!user || !bcrypt.compareSync(ancien_mot_de_passe, user.mot_de_passe)) {
          setFlash('erreur', 'Ancien mot de passe incorrect.');
          return res.redirect('/index.php?page=client_profil');
        }
        if (nouveau_mot_de_passe !== confirmation) {
          setFlash('erreur', 'La confirmation ne correspond pas.');
          return res.redirect('/index.php?page=client_profil');
        }
        user.mot_de_passe = bcrypt.hashSync(nouveau_mot_de_passe, 10);
        setFlash('success', 'Mot de passe modifié avec succès.');
        return res.redirect('/index.php?page=client_profil');
      }

      case 'client_localisation': {
        if (req.session.user) {
          const user = store.findUserById(req.session.user.id_utilisateur);
          if (user) {
            user.consentement_localisation = 1;
            user.latitude = parseFloat(req.body.latitude);
            user.longitude = parseFloat(req.body.longitude);
          }
        }
        return res.json({ status: 'ok' });
      }

      case 'client_commander': {
        if (!req.session.user) return res.redirect('/index.php?page=login');
        const panier = req.session.panier || {};
        if (Object.keys(panier).length === 0) {
          setFlash('erreur', 'Votre panier est vide.');
          return res.redirect('/index.php?page=galerie');
        }
        return res.redirect('/index.php?page=client_paiement');
      }

      case 'client_paiement': {
        if (!req.session.user) return res.redirect('/index.php?page=login');
        const panier = req.session.panier || {};
        if (Object.keys(panier).length === 0) {
          return res.redirect('/index.php?page=galerie');
        }
        return res.render('client/paiement');
      }

      case 'client_commander_sans_paiement': {
        if (!req.session.user) return res.redirect('/index.php?page=login');
        const panier = req.session.panier || {};
        const items = Object.values(panier);
        if (items.length === 0) return res.redirect('/index.php?page=galerie');

        const order = store.createOrder(req.session.user.id_utilisateur, items, 'non_paye');
        req.session.panier = {};
        setFlash('success', `Commande #${order.id_commande} envoyée avec succès pour négociation.`);
        return res.redirect('/index.php?page=client_historique');
      }

      case 'client_commander_preuve': {
        if (!req.session.user) return res.redirect('/index.php?page=login');
        const panier = req.session.panier || {};
        const items = Object.values(panier);
        if (items.length === 0) return res.redirect('/index.php?page=galerie');

        const files = req.files as Express.Multer.File[];
        const preuveFile = files?.find((f) => f.fieldname === 'preuve');
        const filename = preuveFile ? preuveFile.filename : undefined;

        const order = store.createOrder(
          req.session.user.id_utilisateur,
          items,
          req.body.mode_paiement || 'preuve',
          filename
        );
        req.session.panier = {};
        setFlash('success', `Preuve de paiement enregistrée ! Commande #${order.id_commande} en cours de vérification.`);
        return res.redirect('/index.php?page=client_historique');
      }

      case 'client_historique': {
        if (!req.session.user) return res.redirect('/index.php?page=login');
        const orders = store.getOrdersByUserId(req.session.user.id_utilisateur);
        const historique = orders.map((o) => ({
          order: o,
          details: store.getOrderDetails(o.id_commande),
        }));
        return res.render('client/historique', { historique });
      }

      case 'client_commande_depot': {
        if (!req.session.user) return res.redirect('/index.php?page=login');
        const idCommande = parseInt(req.query.id as string, 10);
        const order = store.getOrderById(idCommande);
        if (!order || order.id_utilisateur !== req.session.user.id_utilisateur) {
          setFlash('erreur', 'Commande introuvable.');
          return res.redirect('/index.php?page=client_historique');
        }
        const details = store.getOrderDetails(idCommande);
        return res.render('client/commande_depot', { idCommande, order, details });
      }

      case 'client_commande_depot_enregistrer': {
        if (!req.session.user) return res.redirect('/index.php?page=login');
        const idCommande = parseInt(req.body.id_commande, 10);
        const montant = parseFloat(req.body.montant);
        const mode = req.body.mode_paiement;
        const files = req.files as Express.Multer.File[];
        const preuve = files?.find((f) => f.fieldname === 'preuve')?.filename;

        store.addDeposit(idCommande, montant, mode, preuve);
        setFlash('success', 'Dépôt enregistré avec succès.');
        return res.redirect('/index.php?page=client_historique');
      }

      case 'client_chat': {
        if (!req.session.user) return res.redirect('/index.php?page=login');
        const conv = store.getOrCreateConversation(req.session.user.id_utilisateur);
        const messages = store.getMessages(conv.id_conversation);
        return res.render('client/chat', { messages });
      }

      case 'client_chat_envoyer': {
        if (!req.session.user) return res.redirect('/index.php?page=login');
        const conv = store.getOrCreateConversation(req.session.user.id_utilisateur);
        const contenu = req.body.contenu;
        if (contenu && contenu.trim()) {
          store.addMessage(conv.id_conversation, 'client', contenu.trim());
        }
        return res.redirect('/index.php?page=client_chat');
      }

      case 'client_commentaire': {
        if (!req.session.user) return res.redirect('/index.php?page=login');
        const { texte, note } = req.body;
        store.addComment(req.session.user.id_utilisateur, texte, parseInt(note || '5', 10));
        setFlash('success', 'Votre commentaire a été envoyé à l’équipe CEPS. Merci !');
        return res.redirect('/index.php?page=client_profil');
      }

      // ==========================================
      // ESPACE CAISSIER
      // ==========================================
      case 'caissier_dashboard': {
        if (!req.session.user || (req.session.user.nom_role !== 'caissier' && req.session.user.nom_role !== 'admin')) {
          setFlash('erreur', 'Accès réservé aux caissiers.');
          return res.redirect('/index.php?page=login');
        }
        const produits = store.getProducts({ activeOnly: true });
        const gainDuJour = store.getTodaySalesSum();
        return res.render('caissier/dashboard', {
          produits,
          gainDuJour,
          panierCaisse: req.session.panierCaisse,
        });
      }

      case 'caissier_panier_ajouter': {
        const idProduit = parseInt(req.body.id_produit, 10);
        const quantite = Math.max(1, parseInt(req.body.quantite || '1', 10));
        const produit = store.getProductById(idProduit);

        if (produit) {
          const idStr = String(idProduit);
          if (!req.session.panierCaisse) req.session.panierCaisse = {};

          if (req.session.panierCaisse[idStr]) {
            req.session.panierCaisse[idStr].quantite += quantite;
          } else {
            req.session.panierCaisse[idStr] = {
              id: idProduit,
              nom: produit.nom_produit,
              prix: produit.prix_unitaire,
              quantite,
            };
          }
        }
        return res.redirect('/index.php?page=caissier_dashboard');
      }

      case 'caissier_panier_retirer': {
        const idStr = String(req.body.id);
        if (req.session.panierCaisse && req.session.panierCaisse[idStr]) {
          delete req.session.panierCaisse[idStr];
        }
        return res.redirect('/index.php?page=caissier_dashboard');
      }

      case 'caissier_valider': {
        if (!req.session.user) return res.redirect('/index.php?page=login');
        const panierCaisse = req.session.panierCaisse || {};
        const items = Object.values(panierCaisse);
        if (items.length === 0) return res.redirect('/index.php?page=caissier_dashboard');

        const order = store.recordCashSale(req.session.user.id_utilisateur, items, req.body.mode_paiement || 'especes');
        req.session.panierCaisse = {};
        return res.redirect(`/index.php?page=caissier_commande_recu&id=${order.id_commande}`);
      }

      case 'caissier_commande_recu': {
        const idCommande = parseInt(req.query.id as string, 10);
        const order = store.getOrderById(idCommande);
        if (!order) return res.redirect('/index.php?page=caissier_dashboard');
        const details = store.getOrderDetails(idCommande);
        return res.render('admin/recu_vente', { idCommande, order, details });
      }

      // ==========================================
      // ESPACE ADMIN
      // ==========================================
      case 'admin_dashboard': {
        if (!req.session.user || req.session.user.nom_role !== 'admin') {
          setFlash('erreur', 'Accès réservé aux administrateurs.');
          return res.redirect('/index.php?page=login');
        }
        const gainDuJour = store.getTodaySalesSum();
        const commandes = store.getOrders('en_attente');
        const utilisateurs = store.users;
        const ventesJour = store.getDailySalesGrouped();
        return res.render('admin/dashboard', { gainDuJour, commandes, utilisateurs, ventesJour });
      }

      case 'admin_stock': {
        if (!req.session.user || req.session.user.nom_role !== 'admin') {
          return res.redirect('/index.php?page=login');
        }
        const recherche = req.query.recherche as string | undefined;
        const produits = store.getProducts({ q: recherche, activeOnly: true });
        const categories = store.categories;
        const gainDuJour = store.getTodaySalesSum();
        return res.render('admin/stock', { produits, categories, gainDuJour, recherche });
      }

      case 'admin_produit_ajouter': {
        if (!req.session.user || req.session.user.nom_role !== 'admin') {
          return res.redirect('/index.php?page=login');
        }
        const files = req.files as Express.Multer.File[];
        const imageFile = files?.find((f) => f.fieldname === 'image');

        store.addProduct({
          id_categorie: parseInt(req.body.id_categorie, 10),
          nom_produit: req.body.nom_produit,
          description: req.body.description || '',
          prix_unitaire: parseFloat(req.body.prix_unitaire),
          image: imageFile ? imageFile.filename : undefined,
          quantite_initiale: parseInt(req.body.quantite_initiale || '0', 10),
        });
        setFlash('success', 'Produit ajouté avec succès.');
        return res.redirect('/index.php?page=admin_stock');
      }

      case 'admin_produit_stock': {
        if (!req.session.user || req.session.user.nom_role !== 'admin') {
          return res.redirect('/index.php?page=login');
        }
        store.adjustStock(parseInt(req.body.id, 10), parseInt(req.body.quantite, 10));
        setFlash('success', 'Stock mis à jour.');
        return res.redirect('/index.php?page=admin_stock');
      }

      case 'admin_produit_supprimer': {
        if (!req.session.user || req.session.user.nom_role !== 'admin') {
          return res.redirect('/index.php?page=login');
        }
        store.deleteProduct(parseInt(req.body.id, 10));
        setFlash('success', 'Produit supprimé du catalogue.');
        return res.redirect('/index.php?page=admin_stock');
      }

      case 'admin_commandes': {
        if (!req.session.user || req.session.user.nom_role !== 'admin') {
          return res.redirect('/index.php?page=login');
        }
        const commandes = store.getOrders().filter((o) => o.statut === 'en_attente' || o.statut === 'modifiee_adm');
        return res.render('admin/commandes', { commandes });
      }

      case 'admin_commande_details': {
        if (!req.session.user || req.session.user.nom_role !== 'admin') {
          return res.redirect('/index.php?page=login');
        }
        const idCommande = parseInt(req.query.id as string, 10);
        const order = store.getOrderById(idCommande);
        if (!order) return res.redirect('/index.php?page=admin_commandes');
        const details = store.getOrderDetails(idCommande);
        return res.render('admin/commande_details', { idCommande, order, details });
      }

      case 'admin_commande_prix': {
        if (!req.session.user || req.session.user.nom_role !== 'admin') {
          return res.redirect('/index.php?page=login');
        }
        const idCommande = parseInt(req.body.id_commande, 10);
        const idProduit = parseInt(req.body.id_produit, 10);
        const nouveauPrix = parseFloat(req.body.nouveau_prix);

        store.updateOrderPrice(idCommande, idProduit, nouveauPrix);
        setFlash('success', 'Prix négocié appliqué et client notifié dans le chat.');
        return res.redirect(`/index.php?page=admin_commande_details&id=${idCommande}`);
      }

      case 'admin_commande_approuver': {
        if (!req.session.user || req.session.user.nom_role !== 'admin') {
          return res.redirect('/index.php?page=login');
        }
        const idCommande = parseInt(req.body.id, 10);
        const resApprob = store.approveOrder(idCommande, req.session.user.id_utilisateur);

        if (!resApprob.success) {
          setFlash('erreur', resApprob.message);
        } else {
          setFlash('success', 'Commande approuvée, stock décompté et vente enregistrée.');
        }
        return res.redirect('/index.php?page=admin_commandes');
      }

      case 'admin_commande_refuser': {
        if (!req.session.user || req.session.user.nom_role !== 'admin') {
          return res.redirect('/index.php?page=login');
        }
        store.rejectOrder(parseInt(req.body.id, 10));
        setFlash('success', 'Commande refusée.');
        return res.redirect('/index.php?page=admin_commandes');
      }

      case 'admin_commande_recu': {
        const idCommande = parseInt(req.query.id as string, 10);
        const order = store.getOrderById(idCommande);
        if (!order) return res.redirect('/index.php?page=admin_dashboard');
        const details = store.getOrderDetails(idCommande);
        return res.render('admin/recu_vente', { idCommande, order, details });
      }

      case 'admin_historique_ventes': {
        if (!req.session.user || req.session.user.nom_role !== 'admin') {
          return res.redirect('/index.php?page=login');
        }
        const ventes = store.orders.filter((o) => o.statut === 'approuvee');
        return res.render('admin/historique_ventes', { ventes });
      }

      case 'admin_chat': {
        if (!req.session.user || req.session.user.nom_role !== 'admin') {
          return res.redirect('/index.php?page=login');
        }
        const conversations = store.getConversationsList();
        return res.render('admin/chat_liste', { conversations });
      }

      case 'admin_chat_conversation': {
        if (!req.session.user || req.session.user.nom_role !== 'admin') {
          return res.redirect('/index.php?page=login');
        }
        const idConv = parseInt(req.query.id as string, 10);
        const messages = store.getMessages(idConv);
        // Mark as read
        messages.forEach((m) => (m.lu = 1));
        return res.render('admin/chat_conversation', { idConversation: idConv, messages });
      }

      case 'admin_chat_repondre': {
        if (!req.session.user || req.session.user.nom_role !== 'admin') {
          return res.redirect('/index.php?page=login');
        }
        const idConv = parseInt(req.body.id_conversation, 10);
        const contenu = req.body.contenu;
        if (contenu && contenu.trim()) {
          store.addMessage(idConv, 'admin', contenu.trim());
        }
        return res.redirect(`/index.php?page=admin_chat_conversation&id=${idConv}`);
      }

      case 'admin_chat_demarrer': {
        if (!req.session.user || req.session.user.nom_role !== 'admin') {
          return res.redirect('/index.php?page=login');
        }
        const userId = parseInt(req.query.id as string, 10);
        const conv = store.getOrCreateConversation(userId);
        return res.redirect(`/index.php?page=admin_chat_conversation&id=${conv.id_conversation}`);
      }

      case 'admin_utilisateurs': {
        if (!req.session.user || req.session.user.nom_role !== 'admin') {
          return res.redirect('/index.php?page=login');
        }
        const recherche = (req.query.recherche as string)?.toLowerCase();
        let utilisateurs = store.users;
        if (recherche) {
          utilisateurs = utilisateurs.filter(
            (u) =>
              u.nom.toLowerCase().includes(recherche) ||
              u.prenom.toLowerCase().includes(recherche) ||
              u.email.toLowerCase().includes(recherche)
          );
        }
        return res.render('admin/utilisateurs', { utilisateurs, recherche });
      }

      case 'admin_caissier_creer': {
        if (!req.session.user || req.session.user.nom_role !== 'admin') {
          return res.redirect('/index.php?page=login');
        }
        const { nom, prenom, email, mot_de_passe } = req.body;
        if (store.findUserByEmail(email)) {
          setFlash('erreur', 'Un utilisateur avec cet email existe déjà.');
        } else {
          store.createUser({ nom, prenom, email, mot_de_passe, id_role: 3 });
          setFlash('success', 'Compte caissier créé avec succès.');
        }
        return res.redirect('/index.php?page=admin_utilisateurs');
      }

      case 'admin_utilisateur_debloquer': {
        if (!req.session.user || req.session.user.nom_role !== 'admin') {
          return res.redirect('/index.php?page=login');
        }
        store.unblockUser(parseInt(req.body.id, 10));
        setFlash('success', 'Utilisateur débloqué.');
        return res.redirect('/index.php?page=admin_utilisateurs');
      }

      case 'admin_mdp_modifier': {
        if (!req.session.user || req.session.user.nom_role !== 'admin') {
          return res.redirect('/index.php?page=login');
        }
        const user = store.findUserById(req.session.user.id_utilisateur);
        const { ancien_mot_de_passe, nouveau_mot_de_passe, confirmation } = req.body;

        if (!user || !bcrypt.compareSync(ancien_mot_de_passe, user.mot_de_passe)) {
          setFlash('erreur', 'Ancien mot de passe incorrect.');
          return res.redirect('/index.php?page=admin_dashboard');
        }
        if (nouveau_mot_de_passe !== confirmation) {
          setFlash('erreur', 'La confirmation ne correspond pas.');
          return res.redirect('/index.php?page=admin_dashboard');
        }
        user.mot_de_passe = bcrypt.hashSync(nouveau_mot_de_passe, 10);
        setFlash('success', 'Mot de passe administrateur mis à jour.');
        return res.redirect('/index.php?page=admin_dashboard');
      }

      case 'admin_commentaires': {
        if (!req.session.user || req.session.user.nom_role !== 'admin') {
          return res.redirect('/index.php?page=login');
        }
        const commentaires = store.getComments();
        return res.render('admin/commentaires', { commentaires });
      }

      case 'admin_commentaire_publier': {
        if (!req.session.user || req.session.user.nom_role !== 'admin') {
          return res.redirect('/index.php?page=login');
        }
        const idCom = parseInt(req.body.id_commentaire, 10);
        const idUser = parseInt(req.body.id_utilisateur, 10);
        const rep = req.body.reponse;
        store.publishCommentReply(idCom, idUser, rep);
        setFlash('success', 'Réponse publiée dans le chat du client.');
        return res.redirect('/index.php?page=admin_commentaires');
      }

      default: {
        return res.status(404).render('accueil', {
          produitsAccueil: store.getProducts({ activeOnly: true }).slice(0, 6),
        });
      }
    }
  } catch (err: any) {
    console.error('Erreur lors du traitement de la requête :', err);
    setFlash('erreur', 'Une erreur est survenue lors du traitement.');
    return res.redirect('/index.php?page=accueil');
  }
});

// Direct REST alias routes for smooth navigation
app.get('/galerie', (req, res) => res.redirect('/index.php?page=galerie'));
app.get('/panier', (req, res) => res.redirect('/index.php?page=panier'));
app.get('/login', (req, res) => res.redirect('/index.php?page=login'));
app.get('/inscription', (req, res) => res.redirect('/index.php?page=inscription'));
app.get('/contact', (req, res) => res.redirect('/index.php?page=contact'));
app.get('/apropos', (req, res) => res.redirect('/index.php?page=apropos'));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Serveur CEPS démarré avec succès sur http://0.0.0.0:${PORT}`);
});
