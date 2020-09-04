// Copyright IBM Corp. 2020. All Rights Reserved.
// Node module: @loopback/repository
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

import {Filter, Inclusion} from '@loopback/filter';
import debugFactory from 'debug';
import {AnyObject, Options} from '../../common-types';
import {Entity} from '../../model';
import {EntityCrudRepository} from '../../repositories/repository';
import {
  findByForeignKeys,
  flattenTargetsOfOneToManyRelation,
  StringKeyOf,
} from '../relation.helpers';
import {Getter, HasManyDefinition, InclusionResolver} from '../relation.types';
import {resolveHasManyMetadata} from './has-many.helpers';

const debug = debugFactory(
  'loopback:repository:has-many-through-inclusion-resolver',
);

/**
 * Creates InclusionResolver for HasManyThrough relation.
 * Notice that this function only generates the inclusionResolver.
 * It doesn't register it for the source repository.
 *
 *
 * @param meta - resolved metadata of the hasManyThrough relation
 * @param getTargetRepo - target repository i.e where related instances are
 */
export function createHasManyThroughInclusionResolver<
  Through extends Entity,
  ThroughID,
  ThroughRelations extends object,
  Target extends Entity,
  TargetID,
  TargetRelations extends object
>(
  meta: HasManyDefinition,
  getThroughRepo: Getter<
    EntityCrudRepository<Through, ThroughID, ThroughRelations>
  >,
  getTargetRepo: Getter<
    EntityCrudRepository<Target, TargetID, TargetRelations>
  >,
): InclusionResolver<Entity, Target> {
  const relationMeta = resolveHasManyMetadata(meta);

  return async function fetchHasManyThroughModels(
    entities: Entity[],
    inclusion: Inclusion,
    options?: Options,
  ): Promise<((Target & TargetRelations)[] | undefined)[]> {
    if (!entities.length) return [];

    debug('Fetching target models for entities:', entities);
    debug('Relation metadata:', relationMeta);

    const sourceKey = relationMeta.keyFrom;
    const sourceIds = entities.map(e => (e as AnyObject)[sourceKey]);
    const targetKey = relationMeta.keyTo as StringKeyOf<Target>;
    if (!relationMeta.through) {
      throw new Error(
        `relationMeta.through must be defined on ${relationMeta}`,
      );
    }
    const throughKeyTo = relationMeta.through.keyTo as StringKeyOf<Target>;
    const throughKeyFrom = relationMeta.through.keyFrom as StringKeyOf<Through>;

    debug('Parameters:', {
      sourceKey,
      sourceIds,
      targetKey,
      throughKeyTo,
      throughKeyFrom,
    });

    debug(
      'sourceId types',
      sourceIds.map(i => typeof i),
    );

    const throughRepo = await getThroughRepo();
    const targetRepo = await getTargetRepo();

    // find through models
    const throughFound = await findByForeignKeys(
      throughRepo,
      throughKeyFrom,
      sourceIds,
      inclusion.scope as Filter<Through>,
      options,
    );

    const throughResult = flattenTargetsOfOneToManyRelation(
      sourceIds,
      throughFound,
      throughKeyFrom,
    );

    const result = [];

    // convert to the target entities based on the foreign key
    for (const entityList of throughResult) {
      const newList = [];
      if (entityList) {
        for (const entity of entityList) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const id = (entity as any)[throughKeyTo];
          const targetEntity = await targetRepo.findById(
            id,
            inclusion.scope as Filter<Target>,
          );
          newList.push(targetEntity);
        }
        result.push(newList);
      }
    }

    debug('fetchHasManyThroughModels result', result);
    return result;
  };
}
