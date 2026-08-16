package store

import (
	"context"
	"net/url"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"go.mongodb.org/mongo-driver/v2/mongo/readpref"
)

const defaultDatabase = "cluster_console"

type mongoStore struct {
	client *mongo.Client
	users  *mongo.Collection
	sess   *mongo.Collection
	psets  *mongo.Collection
	audit  *mongo.Collection
}

type mongoUser struct {
	ID                 bson.ObjectID `bson:"_id,omitempty"`
	Username           string        `bson:"username"`
	DisplayName        string        `bson:"displayName"`
	Role               Role          `bson:"role"`
	PasswordHash       string        `bson:"passwordHash"`
	MustChangePassword bool          `bson:"mustChangePassword"`
	Enabled            bool          `bson:"enabled"`
	PermissionSetID    string        `bson:"permissionSetId,omitempty"`
	Namespaces         []string      `bson:"namespaces,omitempty"`
	CreatedAt          time.Time     `bson:"createdAt"`
	UpdatedAt          time.Time     `bson:"updatedAt"`
	CreatedBy          string        `bson:"createdBy,omitempty"`
}

type mongoSession struct {
	ID            string    `bson:"_id"`
	UserID        string    `bson:"userId"`
	Username      string    `bson:"username"`
	CreatedAt     time.Time `bson:"createdAt"`
	LastSeenAt    time.Time `bson:"lastSeenAt"`
	ExpiresAt     time.Time `bson:"expiresAt"`
	IdleExpiresAt time.Time `bson:"idleExpiresAt"`
	IP            string    `bson:"ip"`
	UserAgent     string    `bson:"userAgent"`
}

type mongoPermissionSet struct {
	ID              bson.ObjectID `bson:"_id,omitempty"`
	Name            string        `bson:"name"`
	Description     string        `bson:"description"`
	BuiltinTemplate string        `bson:"builtinTemplate,omitempty"`
	Grants          map[string][]string `bson:"grants"`
	CreatedAt       time.Time     `bson:"createdAt"`
	UpdatedAt       time.Time     `bson:"updatedAt"`
}

type mongoAuditLog struct {
	ID         bson.ObjectID `bson:"_id,omitempty"`
	Timestamp  time.Time     `bson:"timestamp"`
	UserID     string        `bson:"userId,omitempty"`
	Username   string        `bson:"username,omitempty"`
	Role       string        `bson:"role,omitempty"`
	IP         string        `bson:"ip,omitempty"`
	UserAgent  string        `bson:"userAgent,omitempty"`
	SessionID  string        `bson:"sessionId,omitempty"`
	Module     string        `bson:"module,omitempty"`
	Action     string        `bson:"action,omitempty"`
	Result     string        `bson:"result,omitempty"`
	HTTPStatus int           `bson:"httpStatus,omitempty"`
	APIVersion string        `bson:"apiVersion,omitempty"`
	Kind       string        `bson:"kind,omitempty"`
	Namespace  string        `bson:"namespace,omitempty"`
	Name       string        `bson:"name,omitempty"`
	Path       string        `bson:"path,omitempty"`
	Method     string        `bson:"method,omitempty"`
	Details    bson.M        `bson:"details,omitempty"`
	Error      string        `bson:"error,omitempty"`
}

func OpenMongo(ctx context.Context, uri string) (Store, error) {
	client, err := mongo.Connect(options.Client().ApplyURI(uri))
	if err != nil {
		return nil, err
	}

	if err := client.Ping(ctx, readpref.Primary()); err != nil {
		_ = client.Disconnect(ctx)
		return nil, err
	}

	dbName, err := databaseName(uri)
	if err != nil {
		_ = client.Disconnect(ctx)
		return nil, err
	}

	db := client.Database(dbName)
	users := db.Collection("users")
	sess := db.Collection("sessions")
	psets := db.Collection("permission_sets")
	audit := db.Collection("audit_logs")

	indexModel := options.Index().SetUnique(true)
	if _, err := users.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "username", Value: 1}},
		Options: indexModel,
	}); err != nil {
		_ = client.Disconnect(ctx)
		return nil, err
	}
	for _, idx := range []mongo.IndexModel{
		{Keys: bson.D{{Key: "timestamp", Value: -1}}},
		{Keys: bson.D{{Key: "username", Value: 1}}},
		{Keys: bson.D{{Key: "action", Value: 1}}},
		{Keys: bson.D{{Key: "result", Value: 1}}},
		{Keys: bson.D{{Key: "username", Value: 1}, {Key: "timestamp", Value: -1}}},
	} {
		if _, err := audit.Indexes().CreateOne(ctx, idx); err != nil {
			_ = client.Disconnect(ctx)
			return nil, err
		}
	}

	return &mongoStore{
		client: client,
		users:  users,
		sess:   sess,
		psets:  psets,
		audit:  audit,
	}, nil
}

func databaseName(uri string) (string, error) {
	u, err := url.Parse(uri)
	if err != nil {
		return "", err
	}
	dbName := strings.TrimPrefix(u.Path, "/")
	if dbName == "" {
		return defaultDatabase, nil
	}
	return dbName, nil
}

func (m *mongoStore) Ping(ctx context.Context) error {
	return m.client.Ping(ctx, readpref.Primary())
}

func (m *mongoStore) Owner(ctx context.Context) (*User, error) {
	var doc mongoUser
	err := m.users.FindOne(ctx, bson.M{"role": RoleOwner}).Decode(&doc)
	if err == mongo.ErrNoDocuments {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return mongoUserToUser(&doc), nil
}

func (m *mongoStore) CreateOwner(ctx context.Context, u User) error {
	doc, err := userToMongoUser(u)
	if err != nil {
		return err
	}
	doc.Role = RoleOwner
	_, err = m.users.InsertOne(ctx, doc)
	return err
}

func (m *mongoStore) CreateMember(ctx context.Context, u User) error {
	doc, err := userToMongoUser(u)
	if err != nil {
		return err
	}
	doc.Role = RoleMember
	_, err = m.users.InsertOne(ctx, doc)
	return err
}

func (m *mongoStore) ListMembers(ctx context.Context) ([]User, error) {
	cur, err := m.users.Find(ctx, bson.M{"role": RoleMember})
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var out []User
	for cur.Next(ctx) {
		var doc mongoUser
		if err := cur.Decode(&doc); err != nil {
			return nil, err
		}
		out = append(out, *mongoUserToUser(&doc))
	}
	return out, cur.Err()
}

func (m *mongoStore) UpdateMember(ctx context.Context, u User) error {
	oid, err := bson.ObjectIDFromHex(u.ID)
	if err != nil {
		return nil
	}
	_, err = m.users.UpdateOne(ctx,
		bson.M{"_id": oid, "role": RoleMember},
		bson.M{"$set": bson.M{
			"displayName":     u.DisplayName,
			"permissionSetId": u.PermissionSetID,
			"namespaces":      u.Namespaces,
			"enabled":         u.Enabled,
			"updatedAt":       u.UpdatedAt,
		}},
	)
	return err
}

func (m *mongoStore) DeleteMember(ctx context.Context, id string) error {
	oid, err := bson.ObjectIDFromHex(id)
	if err != nil {
		return nil
	}
	res, err := m.users.DeleteOne(ctx, bson.M{"_id": oid, "role": RoleMember})
	if err != nil {
		return err
	}
	if res.DeletedCount == 0 {
		return nil
	}
	_, err = m.sess.DeleteMany(ctx, bson.M{"userId": id})
	return err
}

func (m *mongoStore) ResetMemberPassword(ctx context.Context, userID, hash string) error {
	oid, err := bson.ObjectIDFromHex(userID)
	if err != nil {
		return nil
	}
	_, err = m.users.UpdateOne(ctx,
		bson.M{"_id": oid, "role": RoleMember},
		bson.M{"$set": bson.M{
			"passwordHash":       hash,
			"mustChangePassword": true,
			"updatedAt":          time.Now().UTC(),
		}},
	)
	return err
}

func (m *mongoStore) UpdateOwnerPassword(ctx context.Context, userID, hash string) error {
	oid, err := bson.ObjectIDFromHex(userID)
	if err != nil {
		return nil
	}
	_, err = m.users.UpdateOne(ctx,
		bson.M{"_id": oid, "role": RoleOwner},
		bson.M{"$set": bson.M{"passwordHash": hash}},
	)
	return err
}

func (m *mongoStore) UpdatePassword(ctx context.Context, userID, hash string) error {
	oid, err := bson.ObjectIDFromHex(userID)
	if err != nil {
		return nil
	}
	_, err = m.users.UpdateOne(ctx,
		bson.M{"_id": oid},
		bson.M{"$set": bson.M{
			"passwordHash":       hash,
			"mustChangePassword": false,
			"updatedAt":          time.Now().UTC(),
		}},
	)
	return err
}

func (m *mongoStore) UserByUsername(ctx context.Context, username string) (*User, error) {
	var doc mongoUser
	err := m.users.FindOne(ctx, bson.M{"username": strings.ToLower(username)}).Decode(&doc)
	if err == mongo.ErrNoDocuments {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return mongoUserToUser(&doc), nil
}

func (m *mongoStore) UserByID(ctx context.Context, id string) (*User, error) {
	oid, err := bson.ObjectIDFromHex(id)
	if err != nil {
		return nil, nil
	}
	var doc mongoUser
	err = m.users.FindOne(ctx, bson.M{"_id": oid}).Decode(&doc)
	if err == mongo.ErrNoDocuments {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return mongoUserToUser(&doc), nil
}

func (m *mongoStore) CreateSession(ctx context.Context, s Session) error {
	_, err := m.sess.InsertOne(ctx, sessionToMongoSession(s))
	return err
}

func (m *mongoStore) Session(ctx context.Context, id string) (*Session, error) {
	var doc mongoSession
	err := m.sess.FindOne(ctx, bson.M{"_id": id}).Decode(&doc)
	if err == mongo.ErrNoDocuments {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return mongoSessionToSession(&doc), nil
}

func (m *mongoStore) TouchSession(ctx context.Context, id string, lastSeen, idleExpires time.Time) error {
	_, err := m.sess.UpdateOne(ctx,
		bson.M{"_id": id},
		bson.M{"$set": bson.M{
			"lastSeenAt":    lastSeen,
			"idleExpiresAt": idleExpires,
		}},
	)
	return err
}

func (m *mongoStore) DeleteSession(ctx context.Context, id string) error {
	_, err := m.sess.DeleteOne(ctx, bson.M{"_id": id})
	return err
}

func (m *mongoStore) DeleteSessionsForUser(ctx context.Context, userID string) error {
	_, err := m.sess.DeleteMany(ctx, bson.M{"userId": userID})
	return err
}

func (m *mongoStore) CreatePermissionSet(ctx context.Context, ps PermissionSet) error {
	doc, err := permissionSetToMongo(ps)
	if err != nil {
		return err
	}
	_, err = m.psets.InsertOne(ctx, doc)
	return err
}

func (m *mongoStore) UpdatePermissionSet(ctx context.Context, ps PermissionSet) error {
	oid, err := bson.ObjectIDFromHex(ps.ID)
	if err != nil {
		return nil
	}
	doc, err := permissionSetToMongo(ps)
	if err != nil {
		return err
	}
	_, err = m.psets.ReplaceOne(ctx, bson.M{"_id": oid}, doc)
	return err
}

func (m *mongoStore) DeletePermissionSet(ctx context.Context, id string) error {
	oid, err := bson.ObjectIDFromHex(id)
	if err != nil {
		return nil
	}
	count, err := m.users.CountDocuments(ctx, bson.M{
		"role":            RoleMember,
		"permissionSetId": id,
	})
	if err != nil {
		return err
	}
	if count > 0 {
		return ErrInUse
	}
	_, err = m.psets.DeleteOne(ctx, bson.M{"_id": oid})
	return err
}

func (m *mongoStore) PermissionSet(ctx context.Context, id string) (*PermissionSet, error) {
	oid, err := bson.ObjectIDFromHex(id)
	if err != nil {
		return nil, nil
	}
	var doc mongoPermissionSet
	err = m.psets.FindOne(ctx, bson.M{"_id": oid}).Decode(&doc)
	if err == mongo.ErrNoDocuments {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return mongoPermissionSetToPermissionSet(&doc), nil
}

func (m *mongoStore) ListPermissionSets(ctx context.Context) ([]PermissionSet, error) {
	cur, err := m.psets.Find(ctx, bson.M{})
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var out []PermissionSet
	for cur.Next(ctx) {
		var doc mongoPermissionSet
		if err := cur.Decode(&doc); err != nil {
			return nil, err
		}
		out = append(out, *mongoPermissionSetToPermissionSet(&doc))
	}
	return out, cur.Err()
}

func (m *mongoStore) MembersByPermissionSetID(ctx context.Context, permissionSetID string) ([]User, error) {
	cur, err := m.users.Find(ctx, bson.M{
		"role":            RoleMember,
		"permissionSetId": permissionSetID,
	})
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var out []User
	for cur.Next(ctx) {
		var doc mongoUser
		if err := cur.Decode(&doc); err != nil {
			return nil, err
		}
		out = append(out, *mongoUserToUser(&doc))
	}
	return out, cur.Err()
}

func (m *mongoStore) InsertAudit(ctx context.Context, log AuditLog) (string, error) {
	doc := auditLogToMongo(log)
	res, err := m.audit.InsertOne(ctx, doc)
	if err != nil {
		return "", err
	}
	if oid, ok := res.InsertedID.(bson.ObjectID); ok {
		return oid.Hex(), nil
	}
	return "", nil
}

func (m *mongoStore) QueryAudit(ctx context.Context, filter AuditFilter) ([]AuditLog, error) {
	cur, err := m.audit.Find(ctx, auditFilterToBSON(filter), options.Find().SetSort(bson.D{{Key: "timestamp", Value: -1}}))
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var out []AuditLog
	for cur.Next(ctx) {
		var doc mongoAuditLog
		if err := cur.Decode(&doc); err != nil {
			return nil, err
		}
		out = append(out, *mongoAuditLogToAuditLog(&doc))
	}
	return out, cur.Err()
}

func (m *mongoStore) DeleteAuditIDs(ctx context.Context, ids []string) (int64, error) {
	var oids []bson.ObjectID
	for _, id := range ids {
		oid, err := bson.ObjectIDFromHex(id)
		if err != nil {
			continue
		}
		oids = append(oids, oid)
	}
	if len(oids) == 0 {
		return 0, nil
	}
	res, err := m.audit.DeleteMany(ctx, bson.M{"_id": bson.M{"$in": oids}})
	if err != nil {
		return 0, err
	}
	return res.DeletedCount, nil
}

func (m *mongoStore) DeleteAuditFilter(ctx context.Context, filter AuditFilter) (int64, error) {
	res, err := m.audit.DeleteMany(ctx, auditFilterToBSON(filter))
	if err != nil {
		return 0, err
	}
	return res.DeletedCount, nil
}

func auditFilterToBSON(filter AuditFilter) bson.M {
	q := bson.M{}
	if filter.From != nil || filter.To != nil {
		ts := bson.M{}
		if filter.From != nil {
			ts["$gte"] = *filter.From
		}
		if filter.To != nil {
			ts["$lte"] = *filter.To
		}
		q["timestamp"] = ts
	}
	if filter.Username != "" {
		q["username"] = filter.Username
	}
	if filter.Module != "" {
		q["module"] = filter.Module
	}
	if filter.Action != "" {
		q["action"] = filter.Action
	}
	if filter.Result != "" {
		q["result"] = filter.Result
	}
	if filter.Namespace != "" {
		q["namespace"] = filter.Namespace
	}
	if filter.Kind != "" {
		q["kind"] = filter.Kind
	}
	return q
}

func auditLogToMongo(log AuditLog) mongoAuditLog {
	doc := mongoAuditLog{
		Timestamp:  log.Timestamp,
		UserID:     log.UserID,
		Username:   log.Username,
		Role:       log.Role,
		IP:         log.IP,
		UserAgent:  log.UserAgent,
		SessionID:  log.SessionID,
		Module:     log.Module,
		Action:     log.Action,
		Result:     log.Result,
		HTTPStatus: log.HTTPStatus,
		APIVersion: log.APIVersion,
		Kind:       log.Kind,
		Namespace:  log.Namespace,
		Name:       log.Name,
		Path:       log.Path,
		Method:     log.Method,
		Error:      log.Error,
	}
	if log.Details != nil {
		doc.Details = bson.M(log.Details)
	}
	if log.ID != "" {
		if oid, err := bson.ObjectIDFromHex(log.ID); err == nil {
			doc.ID = oid
			return doc
		}
	}
	doc.ID = bson.NewObjectID()
	return doc
}

func mongoAuditLogToAuditLog(doc *mongoAuditLog) *AuditLog {
	if doc == nil {
		return nil
	}
	log := &AuditLog{
		ID:         doc.ID.Hex(),
		Timestamp:  doc.Timestamp,
		UserID:     doc.UserID,
		Username:   doc.Username,
		Role:       doc.Role,
		IP:         doc.IP,
		UserAgent:  doc.UserAgent,
		SessionID:  doc.SessionID,
		Module:     doc.Module,
		Action:     doc.Action,
		Result:     doc.Result,
		HTTPStatus: doc.HTTPStatus,
		APIVersion: doc.APIVersion,
		Kind:       doc.Kind,
		Namespace:  doc.Namespace,
		Name:       doc.Name,
		Path:       doc.Path,
		Method:     doc.Method,
		Error:      doc.Error,
	}
	if doc.Details != nil {
		log.Details = map[string]any(doc.Details)
	}
	return log
}

func permissionSetToMongo(ps PermissionSet) (mongoPermissionSet, error) {
	doc := mongoPermissionSet{
		Name:            ps.Name,
		Description:     ps.Description,
		BuiltinTemplate: ps.BuiltinTemplate,
		Grants:          cloneGrantsMap(ps.Grants),
		CreatedAt:       ps.CreatedAt,
		UpdatedAt:       ps.UpdatedAt,
	}
	if ps.ID != "" {
		oid, err := bson.ObjectIDFromHex(ps.ID)
		if err == nil {
			doc.ID = oid
			return doc, nil
		}
	}
	doc.ID = bson.NewObjectID()
	return doc, nil
}

func mongoPermissionSetToPermissionSet(doc *mongoPermissionSet) *PermissionSet {
	if doc == nil {
		return nil
	}
	return &PermissionSet{
		ID:              doc.ID.Hex(),
		Name:            doc.Name,
		Description:     doc.Description,
		BuiltinTemplate: doc.BuiltinTemplate,
		Grants:          cloneGrantsMap(doc.Grants),
		CreatedAt:       doc.CreatedAt,
		UpdatedAt:       doc.UpdatedAt,
	}
}

func cloneGrantsMap(grants map[string][]string) map[string][]string {
	if grants == nil {
		return nil
	}
	out := make(map[string][]string, len(grants))
	for k, v := range grants {
		out[k] = append([]string(nil), v...)
	}
	return out
}

func userToMongoUser(u User) (mongoUser, error) {
	doc := mongoUser{
		Username:           strings.ToLower(u.Username),
		DisplayName:        u.DisplayName,
		Role:               u.Role,
		PasswordHash:       u.PasswordHash,
		MustChangePassword: u.MustChangePassword,
		Enabled:            u.Enabled,
		PermissionSetID:    u.PermissionSetID,
		Namespaces:         append([]string(nil), u.Namespaces...),
		CreatedAt:          u.CreatedAt,
		UpdatedAt:          u.UpdatedAt,
		CreatedBy:          u.CreatedBy,
	}

	if u.ID != "" {
		oid, err := bson.ObjectIDFromHex(u.ID)
		if err == nil {
			doc.ID = oid
			return doc, nil
		}
	}
	doc.ID = bson.NewObjectID()
	return doc, nil
}

func mongoUserToUser(doc *mongoUser) *User {
	if doc == nil {
		return nil
	}
	return &User{
		ID:                 doc.ID.Hex(),
		Username:           doc.Username,
		DisplayName:        doc.DisplayName,
		Role:               doc.Role,
		PasswordHash:       doc.PasswordHash,
		MustChangePassword: doc.MustChangePassword,
		Enabled:            doc.Enabled,
		PermissionSetID:    doc.PermissionSetID,
		Namespaces:         append([]string(nil), doc.Namespaces...),
		CreatedAt:          doc.CreatedAt,
		UpdatedAt:          doc.UpdatedAt,
		CreatedBy:          doc.CreatedBy,
	}
}

func sessionToMongoSession(s Session) mongoSession {
	return mongoSession{
		ID:            s.ID,
		UserID:        s.UserID,
		Username:      s.Username,
		CreatedAt:     s.CreatedAt,
		LastSeenAt:    s.LastSeenAt,
		ExpiresAt:     s.ExpiresAt,
		IdleExpiresAt: s.IdleExpiresAt,
		IP:            s.IP,
		UserAgent:     s.UserAgent,
	}
}

func mongoSessionToSession(doc *mongoSession) *Session {
	if doc == nil {
		return nil
	}
	return &Session{
		ID:            doc.ID,
		UserID:        doc.UserID,
		Username:      doc.Username,
		CreatedAt:     doc.CreatedAt,
		LastSeenAt:    doc.LastSeenAt,
		ExpiresAt:     doc.ExpiresAt,
		IdleExpiresAt: doc.IdleExpiresAt,
		IP:            doc.IP,
		UserAgent:     doc.UserAgent,
	}
}
