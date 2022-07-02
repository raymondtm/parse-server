import ClassesRouter from './ClassesRouter';
import { FunctionsRouter } from './FunctionsRouter';

export class RolesRouter extends ClassesRouter {
  className() {
    return '_Role';
  }

  mountRoutes() {
    this.route('GET', '/roles', req => {
      return this.handleFind(req);
    });
    this.route('GET', '/roles/:objectId', req => {
      return this.handleGet(req);
    });
    this.route('POST', '/roles', req => {
      return this.handleCreate(req);
    });
    this.route('PUT', '/roles/:objectId', req => {
      return this.handleUpdate(req);
    });
    this.route('DELETE', '/roles/:objectId', req => {
      return this.handleDelete(req);
    });

    // NOTE: An alias of cloud function
    this.route('POST', '/roles/:functionName', req => {
      req.params.className = this.className();
      return FunctionsRouter.handleCloudFunction(req);
    });
  }
}

export default RolesRouter;
