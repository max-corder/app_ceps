import bcrypt from 'bcryptjs';
import { db } from './firebase.js';
import { collection, doc, getDocs, setDoc } from 'firebase/firestore';

export interface Role {
  id_role: number;
  nom_role: string;
}

export interface User {
  id_utilisateur: number;
  id_role: number;
  nom_role: string;
  nom: string;
  prenom: string;
  email: string;
  mot_de_passe: string;
  telephone?: string;
  photo_profil?: string;
  origine_inscription: 'formulaire' | 'google';
  google_id?: string;
  consentement_localisation: number;
  latitude?: number;
  longitude?: number;
  tentatives_connexion: number;
  compte_bloque: number;
  date_inscription: string;
}

export interface Category {
  id_categorie: number;
  nom_categorie: string;
  type: 'pharmaceutique' | 'cosmetique';
}

export interface Product {
  id_produit: number;
  id_categorie: number;
  nom_categorie: string;
  type: 'pharmaceutique' | 'cosmetique';
  nom_produit: string;
  description: string;
  prix_unitaire: number;
  image?: string;
  actif: number;
  quantite_disponible: number;
  seuil_alerte: number;
  date_ajout: string;
}

export interface OrderDetail {
  id_detail: number;
  id_commande: number;
  id_produit: number;
  nom_produit: string;
  quantite: number;
  prix_unitaire_negocie: number;
  sous_total: number;
}

export interface Order {
  id_commande: number;
  id_utilisateur: number;
  statut: 'en_attente' | 'modifiee_adm' | 'approuvee' | 'refusee';
  mode_paiement: string;
  montant_total: number;
  montant_acompte?: number;
  mode_paiement_acompte?: string;
  preuve_acompte?: string;
  date_acompte?: string;
  date_commande: string;
  date_approbation?: string;
  id_admin_approbateur?: number;
  // Join fields:
  nom?: string;
  prenom?: string;
  email?: string;
  telephone?: string;
  nom_role?: string;
}

export interface Sale {
  id_vente: number;
  id_commande: number;
  id_produit: number;
  nom_produit: string;
  quantite_vendue: number;
  montant: number;
  date_vente: string;
  jour_vente: string;
  heure_vente: string;
  mois_vente: string;
}

export interface Conversation {
  id_conversation: number;
  id_utilisateur: number;
  date_creation: string;
}

export interface Message {
  id_message: number;
  id_conversation: number;
  expediteur: 'client' | 'admin' | 'system';
  contenu: string;
  preuve_paiement?: string;
  lu: number;
  date_envoi: string;
}

export interface Comment {
  id_commentaire: number;
  id_utilisateur: number;
  contenu_json: { texte: string; note: number };
  publie_par_admin: number;
  date_commentaire: string;
  nom?: string;
  prenom?: string;
}

function formatDate(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatDay(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatMonth(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function formatTime(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

class InMemoryStore {
  public roles: Role[] = [
    { id_role: 1, nom_role: 'admin' },
    { id_role: 2, nom_role: 'client' },
    { id_role: 3, nom_role: 'caissier' },
  ];

  public categories: Category[] = [
    { id_categorie: 1, nom_categorie: 'Médicaments génériques', type: 'pharmaceutique' },
    { id_categorie: 2, nom_categorie: 'Vitamines & compléments', type: 'pharmaceutique' },
    { id_categorie: 3, nom_categorie: 'Matériel médical', type: 'pharmaceutique' },
    { id_categorie: 4, nom_categorie: 'Soins du visage', type: 'cosmetique' },
    { id_categorie: 5, nom_categorie: 'Soins du corps', type: 'cosmetique' },
    { id_categorie: 6, nom_categorie: 'Parfumerie', type: 'cosmetique' },
  ];

  public users: User[] = [];
  public products: Product[] = [];
  public orders: Order[] = [];
  public orderDetails: OrderDetail[] = [];
  public sales: Sale[] = [];
  public conversations: Conversation[] = [];
  public messages: Message[] = [];
  public comments: Comment[] = [];

  private nextUserId = 1;
  private nextProductId = 1;
  private nextOrderId = 1;
  private nextDetailId = 1;
  private nextSaleId = 1;
  private nextConvId = 1;
  private nextMessageId = 1;
  private nextCommentId = 1;

  constructor() {
    this.seed();
    this.initFirestore().catch((err) => console.warn('Erreur synchro initiale Firestore:', err));
  }

  public async syncToFirestore(collName: string, id: string | number, data: any) {
    try {
      const docRef = doc(db, collName, String(id));
      await setDoc(docRef, JSON.parse(JSON.stringify(data)), { merge: true });
    } catch (e: any) {
      console.warn(`[Firestore Sync Warning] coll: ${collName}, id: ${id}`, e?.message || e);
    }
  }

  public async initFirestore() {
    try {
      const prodSnapshot = await getDocs(collection(db, 'products'));
      if (prodSnapshot.empty) {
        console.log('Synchronisation initiale de la base CEPS vers Firestore...');
        for (const p of this.products) {
          await this.syncToFirestore('products', p.id_produit, p);
        }
        for (const c of this.categories) {
          await this.syncToFirestore('categories', c.id_categorie, c);
        }
        for (const u of this.users) {
          await this.syncToFirestore('users', u.id_utilisateur, u);
        }
        console.log('Données initiales CEPS synchronisées dans Cloud Firestore avec succès.');
      } else {
        console.log(`Chargement de ${prodSnapshot.size} produits depuis Cloud Firestore.`);
        prodSnapshot.forEach((d) => {
          const data = d.data() as Product;
          const idx = this.products.findIndex((p) => p.id_produit === data.id_produit);
          if (idx >= 0) {
            this.products[idx] = data;
          } else {
            this.products.push(data);
          }
        });
      }
    } catch (e: any) {
      console.warn('Notification initFirestore:', e?.message || e);
    }
  }

  private seed() {
    // Seed Users
    const salt = bcrypt.genSaltSync(10);
    const adminPass = bcrypt.hashSync('Admin1234', salt);
    const clientPass = bcrypt.hashSync('Client1234', salt);
    const caissierPass = bcrypt.hashSync('Caissier1234', salt);

    this.users = [
      {
        id_utilisateur: this.nextUserId++,
        id_role: 1,
        nom_role: 'admin',
        nom: 'CEPS',
        prenom: 'Administrateur',
        email: 'admin@ceps.com',
        mot_de_passe: adminPass,
        origine_inscription: 'formulaire',
        consentement_localisation: 0,
        tentatives_connexion: 0,
        compte_bloque: 0,
        date_inscription: '2025-01-01 10:00:00',
      },
      {
        id_utilisateur: this.nextUserId++,
        id_role: 2,
        nom_role: 'client',
        nom: 'Jean',
        prenom: 'Baptiste',
        email: 'client@ceps.com',
        mot_de_passe: clientPass,
        telephone: '+509 37 00 11 22',
        origine_inscription: 'formulaire',
        consentement_localisation: 1,
        latitude: 18.5392,
        longitude: -72.3364,
        tentatives_connexion: 0,
        compte_bloque: 0,
        date_inscription: '2025-01-05 14:30:00',
      },
      {
        id_utilisateur: this.nextUserId++,
        id_role: 3,
        nom_role: 'caissier',
        nom: 'Gérard',
        prenom: 'Marie',
        email: 'caissier@ceps.com',
        mot_de_passe: caissierPass,
        telephone: '+509 38 12 34 56',
        origine_inscription: 'formulaire',
        consentement_localisation: 0,
        tentatives_connexion: 0,
        compte_bloque: 0,
        date_inscription: '2025-01-10 09:15:00',
      },
    ];

    // Seed Products (matches the images present in uploads/produits)
    this.products = [
      {
        id_produit: this.nextProductId++,
        id_categorie: 1,
        nom_categorie: 'Médicaments génériques',
        type: 'pharmaceutique',
        nom_produit: 'Paracétamol 500mg (Boîte de 20)',
        description: 'Antalgique et antipyrétique de référence pour soulager les douleurs légères à modérées et faire baisser la fièvre.',
        prix_unitaire: 5.5,
        image: 'ef22c1444801e27e9cd07e13c77036e3.png',
        actif: 1,
        quantite_disponible: 120,
        seuil_alerte: 15,
        date_ajout: '2025-01-10 10:00:00',
      },
      {
        id_produit: this.nextProductId++,
        id_categorie: 2,
        nom_categorie: 'Vitamines & compléments',
        type: 'pharmaceutique',
        nom_produit: 'Complexe Multivitamines C & Zinc',
        description: 'Formule tonus & défenses immunitaires. Soutient le métabolisme et réduit la fatigue au quotidien.',
        prix_unitaire: 18.0,
        image: 'ef291201b41a10e677093e70d7b90ca9.webp',
        actif: 1,
        quantite_disponible: 50,
        seuil_alerte: 10,
        date_ajout: '2025-01-12 11:30:00',
      },
      {
        id_produit: this.nextProductId++,
        id_categorie: 3,
        nom_categorie: 'Matériel médical',
        type: 'pharmaceutique',
        nom_produit: 'Tensiomètre Électronique CEPS Brassard',
        description: 'Appareil de mesure automatique de la tension artérielle au bras, affichage LCD rétro-éclairé, détection d’arythmie.',
        prix_unitaire: 65.0,
        image: 'bc4112af5f68e763608375de8d7a3137.jpg',
        actif: 1,
        quantite_disponible: 15,
        seuil_alerte: 5,
        date_ajout: '2025-01-15 09:00:00',
      },
      {
        id_produit: this.nextProductId++,
        id_categorie: 4,
        nom_categorie: 'Soins du visage',
        type: 'cosmetique',
        nom_produit: 'Crème Hydratante Apaisante Visage & Corps',
        description: 'Soin hydratant 24h haute tolérance enrichi en céramides et acide hyaluronique pour peaux sèches à sensibles.',
        prix_unitaire: 25.0,
        image: '0b37f9494b229821d393bb4c2b7fdb98.jpg',
        actif: 1,
        quantite_disponible: 45,
        seuil_alerte: 8,
        date_ajout: '2025-01-18 14:00:00',
      },
      {
        id_produit: this.nextProductId++,
        id_categorie: 4,
        nom_categorie: 'Soins du visage',
        type: 'cosmetique',
        nom_produit: 'Sérum Réparateur Éclat Vitamine C',
        description: 'Sérum concentré régénérant illuminateur pour revitaliser la peau, estomper les taches et lisser le teint.',
        prix_unitaire: 35.0,
        image: '4a4ccc3ffd6ecb05f312f7de6f005815.webp',
        actif: 1,
        quantite_disponible: 25,
        seuil_alerte: 5,
        date_ajout: '2025-01-20 16:30:00',
      },
      {
        id_produit: this.nextProductId++,
        id_categorie: 6,
        nom_categorie: 'Parfumerie',
        type: 'cosmetique',
        nom_produit: 'Eau de Parfum Élégance Florale 100ml',
        description: 'Une fragrance raffinée aux notes florales et boisées délicates, longue tenue pour toutes les occasions.',
        prix_unitaire: 42.0,
        image: 'fe6a3e986aaceb6ba099a4521158b42e.webp',
        actif: 1,
        quantite_disponible: 20,
        seuil_alerte: 5,
        date_ajout: '2025-01-22 17:00:00',
      },
    ];

    // Seed an initial demo order & conversation for client
    const demoClient = this.users[1];
    const orderId = this.nextOrderId++;
    const order1: Order = {
      id_commande: orderId,
      id_utilisateur: demoClient.id_utilisateur,
      statut: 'en_attente',
      mode_paiement: 'moncash',
      montant_total: 48.5,
      date_commande: '2025-02-01 10:15:00',
      nom: demoClient.nom,
      prenom: demoClient.prenom,
      email: demoClient.email,
      telephone: demoClient.telephone,
      nom_role: 'client',
    };
    this.orders.push(order1);
    this.orderDetails.push(
      {
        id_detail: this.nextDetailId++,
        id_commande: orderId,
        id_produit: 1,
        nom_produit: 'Paracétamol 500mg (Boîte de 20)',
        quantite: 1,
        prix_unitaire_negocie: 5.5,
        sous_total: 5.5,
      },
      {
        id_detail: this.nextDetailId++,
        id_commande: orderId,
        id_produit: 6,
        nom_produit: 'Eau de Parfum Élégance Florale 100ml',
        quantite: 1,
        prix_unitaire_negocie: 43.0,
        sous_total: 43.0,
      }
    );

    // Seed conversation
    const convId = this.nextConvId++;
    this.conversations.push({
      id_conversation: convId,
      id_utilisateur: demoClient.id_utilisateur,
      date_creation: '2025-02-01 10:16:00',
    });
    this.messages.push({
      id_message: this.nextMessageId++,
      id_conversation: convId,
      expediteur: 'system',
      contenu: 'Commande #1 passée pour un total de 48.50 $. Mode de paiement : MONCASH.',
      lu: 1,
      date_envoi: '2025-02-01 10:16:00',
    });
    this.messages.push({
      id_message: this.nextMessageId++,
      id_conversation: convId,
      expediteur: 'client',
      contenu: 'Bonjour CEPS, est-ce que la livraison est possible cet après-midi à Pétion-Ville ?',
      lu: 0,
      date_envoi: '2025-02-01 10:20:00',
    });

    // Seed a comment
    this.comments.push({
      id_commentaire: this.nextCommentId++,
      id_utilisateur: demoClient.id_utilisateur,
      contenu_json: { texte: 'Produits reçus rapidement et d’excellente qualité. Service client très réactif !', note: 5 },
      publie_par_admin: 0,
      date_commentaire: '2025-02-02 14:00:00',
      nom: demoClient.nom,
      prenom: demoClient.prenom,
    });
  }

  // --- Products ---
  public getProducts(options?: { idCategorie?: number; type?: string; q?: string; activeOnly?: boolean }): Product[] {
    let list = this.products;
    if (options?.activeOnly ?? true) {
      list = list.filter((p) => p.actif === 1);
    }
    if (options?.idCategorie) {
      list = list.filter((p) => p.id_categorie === options.idCategorie);
    }
    if (options?.type) {
      list = list.filter((p) => p.type === options.type);
    }
    if (options?.q) {
      const q = options.q.toLowerCase().trim();
      list = list.filter((p) => p.nom_produit.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
    }
    return list;
  }

  public getProductById(id: number): Product | undefined {
    return this.products.find((p) => p.id_produit === id);
  }

  public addProduct(p: { id_categorie: number; nom_produit: string; description: string; prix_unitaire: number; image?: string; quantite_initiale: number }): Product {
    const cat = this.categories.find((c) => c.id_categorie === p.id_categorie);
    const prod: Product = {
      id_produit: this.nextProductId++,
      id_categorie: p.id_categorie,
      nom_categorie: cat ? cat.nom_categorie : 'Général',
      type: cat ? cat.type : 'pharmaceutique',
      nom_produit: p.nom_produit,
      description: p.description,
      prix_unitaire: p.prix_unitaire,
      image: p.image,
      actif: 1,
      quantite_disponible: p.quantite_initiale,
      seuil_alerte: 5,
      date_ajout: formatDate(),
    };
    this.products.unshift(prod);
    return prod;
  }

  public updateProduct(id: number, data: Partial<Product>): boolean {
    const prod = this.getProductById(id);
    if (!prod) return false;
    Object.assign(prod, data);
    if (data.id_categorie) {
      const cat = this.categories.find((c) => c.id_categorie === data.id_categorie);
      if (cat) {
        prod.nom_categorie = cat.nom_categorie;
        prod.type = cat.type;
      }
    }
    return true;
  }

  public deleteProduct(id: number): boolean {
    const prod = this.getProductById(id);
    if (!prod) return false;
    prod.actif = 0;
    return true;
  }

  public adjustStock(id: number, quantite: number): boolean {
    const prod = this.getProductById(id);
    if (!prod) return false;
    prod.quantite_disponible = quantite;
    return true;
  }

  // --- Users ---
  public findUserByEmail(email: string): User | undefined {
    return this.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  }

  public findUserById(id: number): User | undefined {
    return this.users.find((u) => u.id_utilisateur === id);
  }

  public createUser(userData: {
    nom: string;
    prenom: string;
    email: string;
    mot_de_passe: string;
    id_role?: number;
    origine?: 'formulaire' | 'google';
    google_id?: string;
  }): User {
    const idRole = userData.id_role || 2; // Default to client
    const role = this.roles.find((r) => r.id_role === idRole) || this.roles[1];
    const newUser: User = {
      id_utilisateur: this.nextUserId++,
      id_role: idRole,
      nom_role: role.nom_role,
      nom: userData.nom,
      prenom: userData.prenom,
      email: userData.email,
      mot_de_passe: bcrypt.hashSync(userData.mot_de_passe, 10),
      origine_inscription: userData.origine || 'formulaire',
      google_id: userData.google_id,
      consentement_localisation: 0,
      tentatives_connexion: 0,
      compte_bloque: 0,
      date_inscription: formatDate(),
    };
    this.users.push(newUser);
    return newUser;
  }

  public unblockUser(id: number) {
    const u = this.findUserById(id);
    if (u) {
      u.compte_bloque = 0;
      u.tentatives_connexion = 0;
    }
  }

  // --- Orders ---
  public getOrders(statut?: string): Order[] {
    let list = this.orders;
    if (statut) {
      list = list.filter((o) => o.statut === statut);
    }
    return list.slice().reverse();
  }

  public getOrdersByUserId(userId: number): Order[] {
    return this.orders.filter((o) => o.id_utilisateur === userId).slice().reverse();
  }

  public getOrderById(id: number): Order | undefined {
    return this.orders.find((o) => o.id_commande === id);
  }

  public getOrderDetails(orderId: number): OrderDetail[] {
    return this.orderDetails.filter((d) => d.id_commande === orderId);
  }

  public createOrder(
    userId: number,
    items: { id: number; nom: string; prix: number; quantite: number }[],
    modePaiement: string = 'non_paye',
    preuvePaiement?: string
  ): Order {
    const user = this.findUserById(userId);
    const orderId = this.nextOrderId++;
    let total = 0;

    for (const item of items) {
      const subtotal = item.prix * item.quantite;
      total += subtotal;
      this.orderDetails.push({
        id_detail: this.nextDetailId++,
        id_commande: orderId,
        id_produit: item.id,
        nom_produit: item.nom,
        quantite: item.quantite,
        prix_unitaire_negocie: item.prix,
        sous_total: subtotal,
      });
    }

    const newOrder: Order = {
      id_commande: orderId,
      id_utilisateur: userId,
      statut: 'en_attente',
      mode_paiement: modePaiement,
      montant_total: total,
      date_commande: formatDate(),
      nom: user?.nom || '',
      prenom: user?.prenom || '',
      email: user?.email || '',
      telephone: user?.telephone,
      nom_role: user?.nom_role,
    };

    if (preuvePaiement) {
      newOrder.preuve_acompte = preuvePaiement;
    }

    this.orders.push(newOrder);

    // Automatically post a system message to the chat
    const conv = this.getOrCreateConversation(userId);
    this.addMessage(
      conv.id_conversation,
      'system',
      `Nouvelle commande #${orderId} de ${total.toFixed(2)} $. Mode de paiement : ${modePaiement.toUpperCase()}.`,
      preuvePaiement
    );

    return newOrder;
  }

  public updateOrderPrice(orderId: number, productId: number, newPrice: number): boolean {
    const detail = this.orderDetails.find((d) => d.id_commande === orderId && d.id_produit === productId);
    if (!detail) return false;

    detail.prix_unitaire_negocie = newPrice;
    detail.sous_total = detail.quantite * newPrice;

    // Recalculate total
    const allDetails = this.getOrderDetails(orderId);
    const order = this.getOrderById(orderId);
    if (order) {
      order.montant_total = allDetails.reduce((acc, curr) => acc + curr.sous_total, 0);
      order.statut = 'modifiee_adm';

      // Notify in chat
      const conv = this.getOrCreateConversation(order.id_utilisateur);
      this.addMessage(
        conv.id_conversation,
        'system',
        `Le prix du produit "${detail.nom_produit}" a été négocié à ${newPrice.toFixed(2)} $. Nouveau montant total de la commande #${orderId} : ${order.montant_total.toFixed(2)} $.`
      );
    }
    return true;
  }

  public approveOrder(orderId: number, adminId: number): { success: boolean; message: string } {
    const order = this.getOrderById(orderId);
    if (!order) return { success: false, message: 'Commande introuvable' };

    const details = this.getOrderDetails(orderId);

    // Verify stock
    for (const d of details) {
      const prod = this.getProductById(d.id_produit);
      if (!prod || prod.quantite_disponible < d.quantite) {
        return { success: false, message: `Stock insuffisant pour ${d.nom_produit}` };
      }
    }

    // Deduct stock and register sales
    const now = new Date();
    for (const d of details) {
      const prod = this.getProductById(d.id_produit)!;
      prod.quantite_disponible -= d.quantite;

      this.sales.push({
        id_vente: this.nextSaleId++,
        id_commande: orderId,
        id_produit: d.id_produit,
        nom_produit: d.nom_produit,
        quantite_vendue: d.quantite,
        montant: d.sous_total,
        date_vente: formatDate(now),
        jour_vente: formatDay(now),
        heure_vente: formatTime(now),
        mois_vente: formatMonth(now),
      });
    }

    order.statut = 'approuvee';
    order.date_approbation = formatDate(now);
    order.id_admin_approbateur = adminId;

    // Notify in chat
    const conv = this.getOrCreateConversation(order.id_utilisateur);
    this.addMessage(
      conv.id_conversation,
      'system',
      `Félicitations ! Votre commande #${orderId} a été approuvée par l'administration CEPS.`
    );

    return { success: true, message: 'Commande approuvée avec succès.' };
  }

  public rejectOrder(orderId: number): boolean {
    const order = this.getOrderById(orderId);
    if (!order) return false;
    order.statut = 'refusee';

    const conv = this.getOrCreateConversation(order.id_utilisateur);
    this.addMessage(
      conv.id_conversation,
      'system',
      `Votre commande #${orderId} a été refusée par l'administration CEPS.`
    );
    return true;
  }

  public addDeposit(orderId: number, montant: number, modePaiement: string, preuve?: string): boolean {
    const order = this.getOrderById(orderId);
    if (!order) return false;
    order.montant_acompte = montant;
    order.mode_paiement_acompte = modePaiement;
    order.date_acompte = formatDate();
    if (preuve) {
      order.preuve_acompte = preuve;
    }

    const conv = this.getOrCreateConversation(order.id_utilisateur);
    this.addMessage(
      conv.id_conversation,
      'system',
      `Un dépôt de ${montant.toFixed(2)} $ via ${modePaiement.toUpperCase()} a été transmis pour la commande #${orderId}.`,
      preuve
    );
    return true;
  }

  // --- Cashier POS Sale ---
  public recordCashSale(caissierId: number, items: { id: number; nom: string; prix: number; quantite: number }[], modePaiement: string = 'especes'): Order {
    const user = this.findUserById(caissierId);
    const orderId = this.nextOrderId++;
    let total = 0;
    const now = new Date();

    for (const item of items) {
      const subtotal = item.prix * item.quantite;
      total += subtotal;

      this.orderDetails.push({
        id_detail: this.nextDetailId++,
        id_commande: orderId,
        id_produit: item.id,
        nom_produit: item.nom,
        quantite: item.quantite,
        prix_unitaire_negocie: item.prix,
        sous_total: subtotal,
      });

      // Deduct stock
      const prod = this.getProductById(item.id);
      if (prod) {
        prod.quantite_disponible = Math.max(0, prod.quantite_disponible - item.quantite);
      }

      // Record in sales
      this.sales.push({
        id_vente: this.nextSaleId++,
        id_commande: orderId,
        id_produit: item.id,
        nom_produit: item.nom,
        quantite_vendue: item.quantite,
        montant: subtotal,
        date_vente: formatDate(now),
        jour_vente: formatDay(now),
        heure_vente: formatTime(now),
        mois_vente: formatMonth(now),
      });
    }

    const order: Order = {
      id_commande: orderId,
      id_utilisateur: caissierId,
      statut: 'approuvee',
      mode_paiement: modePaiement,
      montant_total: total,
      date_commande: formatDate(now),
      date_approbation: formatDate(now),
      id_admin_approbateur: caissierId,
      nom: user?.nom || 'Client',
      prenom: user?.prenom || 'Comptoir',
      email: user?.email || '',
      telephone: user?.telephone,
      nom_role: 'caissier',
    };
    this.orders.push(order);
    return order;
  }

  // --- Sales Stats ---
  public getSales(): Sale[] {
    return this.sales.slice().reverse();
  }

  public getTodaySalesSum(): number {
    const today = formatDay();
    return this.sales
      .filter((s) => s.jour_vente === today)
      .reduce((sum, s) => sum + s.montant, 0);
  }

  public getDailySalesGrouped(): { jour_vente: string; nom_produit: string; total_quantite: number; total_gain: number }[] {
    const map = new Map<string, { jour_vente: string; nom_produit: string; total_quantite: number; total_gain: number }>();
    for (const s of this.sales) {
      const key = `${s.jour_vente}_${s.nom_produit}`;
      const entry = map.get(key) || { jour_vente: s.jour_vente, nom_produit: s.nom_produit, total_quantite: 0, total_gain: 0 };
      entry.total_quantite += s.quantite_vendue;
      entry.total_gain += s.montant;
      map.set(key, entry);
    }
    return Array.from(map.values()).slice().reverse();
  }

  // --- Chat ---
  public getOrCreateConversation(userId: number): Conversation {
    let conv = this.conversations.find((c) => c.id_utilisateur === userId);
    if (!conv) {
      conv = {
        id_conversation: this.nextConvId++,
        id_utilisateur: userId,
        date_creation: formatDate(),
      };
      this.conversations.push(conv);
    }
    return conv;
  }

  public getConversationById(id: number): Conversation | undefined {
    return this.conversations.find((c) => c.id_conversation === id);
  }

  public getMessages(convId: number): Message[] {
    return this.messages.filter((m) => m.id_conversation === convId);
  }

  public addMessage(convId: number, expediteur: 'client' | 'admin' | 'system', contenu: string, preuve?: string): Message {
    const msg: Message = {
      id_message: this.nextMessageId++,
      id_conversation: convId,
      expediteur,
      contenu,
      preuve_paiement: preuve,
      lu: 0,
      date_envoi: formatDate(),
    };
    this.messages.push(msg);
    return msg;
  }

  public getConversationsList(): { id_conversation: number; prenom: string; nom: string; dernier_message: string; non_lus: number }[] {
    return this.conversations.map((c) => {
      const user = this.findUserById(c.id_utilisateur);
      const msgs = this.getMessages(c.id_conversation);
      const last = msgs[msgs.length - 1];
      const nonLus = msgs.filter((m) => m.expediteur === 'client' && m.lu === 0).length;
      return {
        id_conversation: c.id_conversation,
        prenom: user?.prenom || '',
        nom: user?.nom || '',
        dernier_message: last ? last.contenu : 'Aucun message',
        non_lus: nonLus,
      };
    });
  }

  // --- Comments ---
  public getComments(): Comment[] {
    return this.comments.slice().reverse();
  }

  public addComment(userId: number, texte: string, note: number): Comment {
    const user = this.findUserById(userId);
    const com: Comment = {
      id_commentaire: this.nextCommentId++,
      id_utilisateur: userId,
      contenu_json: { texte, note },
      publie_par_admin: 0,
      date_commentaire: formatDate(),
      nom: user?.nom,
      prenom: user?.prenom,
    };
    this.comments.push(com);
    return com;
  }

  public publishCommentReply(commentId: number, userId: number, reponse: string): boolean {
    const c = this.comments.find((item) => item.id_commentaire === commentId);
    if (c) {
      c.publie_par_admin = 1;
      const conv = this.getOrCreateConversation(userId);
      this.addMessage(conv.id_conversation, 'admin', `Réponse de l'administration à votre avis : "${reponse}"`);
      return true;
    }
    return false;
  }
}

export const store = new InMemoryStore();
